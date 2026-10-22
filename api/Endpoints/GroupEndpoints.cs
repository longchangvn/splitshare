using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using SplitShare.Api.Auth;
using SplitShare.Api.Common;
using SplitShare.Api.Data;
using SplitShare.Api.Groups;

namespace SplitShare.Api.Endpoints;

public static class GroupEndpoints
{
    private static IResult ToResult(GroupOp r) => r.Ok ? Results.Ok(r.Data ?? new { status = "ok" })
        : ApiResults.Error(r.ErrorCode!, r.Error!, r.ErrorCode switch
        {
            "NOT_FOUND" => 404,
            "FORBIDDEN" => 403,
            "GROUP_READ_ONLY" => 403,
            "GROUP_FULL" => 403,
            "INVITE_ROTATED" => 410,
            "HAS_OPEN_BALANCE" => 422,
            _ => 422
        });

    private static Guid Me(ClaimsPrincipal p) => AuthEndpoints.CurrentUserId(p)!.Value;

    private static async Task<object> DetailAsync(AppDbContext db, Guid groupId, Guid me, Groups.GroupService svc, IConfiguration config)
    {
        var g = (await db.Groups.FindAsync(groupId))!;
        var members = await db.GroupMembers.Where(m => m.GroupId == groupId).ToListAsync();
        var ids = members.Select(m => m.UserId).ToList();
        var users = await db.Users.Where(u => ids.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => new { u.DisplayName, u.Username });
        var myRole = members.FirstOrDefault(m => m.UserId == me)?.Role;
        var baseUrl = (config["App:BaseUrl"] ?? "http://localhost:3000").TrimEnd('/');
        // Stable join link for owners/treasurers — same token as email invites.
        string? inviteLink = myRole is "owner" or "treasurer"
            ? GroupService.InviteLink(baseUrl, g.InviteToken)
            : null;
        return new
        {
            group_id = g.Id,
            name = g.Name,
            currency = g.Currency,
            status = g.Status,
            created_at = g.CreatedAt,
            my_role = myRole,
            mode = g.Mode,
            flat_fee_cents = g.FlatFeeCents,
            has_share_link = g.ShareToken != null,
            invite_link = inviteLink,
            budget = await svc.BudgetViewAsync(groupId),
            members = members.Select(m => new
            {
                user_id = m.UserId,
                role = m.Role,
                deposit_paid = m.DepositPaid,
                display_name = users.TryGetValue(m.UserId, out var u) ? u.DisplayName : "Unknown",
                username = users.TryGetValue(m.UserId, out var u2) ? u2.Username : "?"
            })
        };
    }

    public static void Map(RouteGroupBuilder api)
    {
        api.MapPost("/groups", async (CreateGroupDto d, ClaimsPrincipal p, GroupService svc) =>
            ToResult(await svc.CreateAsync(Me(p), d.Name, d.Currency, d.MemberIds ?? [], d.InviteEmails ?? [])));

        api.MapGet("/groups", async (ClaimsPrincipal p, AppDbContext db) =>
        {
            var me = Me(p);
            var ids = await db.GroupMembers.Where(m => m.UserId == me).Select(m => m.GroupId).ToListAsync();
            var groups = await db.Groups.Where(g => ids.Contains(g.Id) && g.DeletedAt == null)
                .Select(g => new { group_id = g.Id, name = g.Name, currency = g.Currency, status = g.Status }).ToListAsync();
            return Results.Ok(groups);
        });

        api.MapGet("/groups/{id:guid}", async (Guid id, ClaimsPrincipal p, AppDbContext db, GroupService svc, Services.RecurringService recurring, IConfiguration config) =>
        {
            var me = Me(p);
            if (await svc.RoleAsync(id, me) is null) return ApiResults.Error("FORBIDDEN", "Not a group member.", 403);
            await RecurringEndpoints.Materialize(id, recurring);
            return Results.Ok(await DetailAsync(db, id, me, svc, config));
        });

        api.MapPatch("/groups/{id:guid}", async (Guid id, RenameGroupDto d, ClaimsPrincipal p, GroupService svc) =>
            ToResult(await svc.RenameAsync(Me(p), id, d.Name)));

        api.MapPatch("/groups/{id:guid}/settings", async (Guid id, SettingsDto d, ClaimsPrincipal p, GroupService svc) =>
            ToResult(await svc.UpdateSettingsAsync(Me(p), id, d.Budget, d.BudgetAlertPct, d.Mode, d.FlatFee)));

        api.MapPatch("/groups/{id:guid}/status", async (Guid id, GroupStatusDto d, ClaimsPrincipal p, GroupService svc) =>
            ToResult(await svc.UpdateStatusAsync(Me(p), id, d.Status)));

        api.MapPost("/groups/from-template", async (TemplateDto d, ClaimsPrincipal p, GroupService svc) =>
            ToResult(await svc.FromTemplateAsync(Me(p), d.Name, d.Currency, d.Template, d.Budget, d.FlatFee)));

        api.MapPatch("/groups/{id:guid}/members/{uid:guid}", async (Guid id, Guid uid, RoleDto d, ClaimsPrincipal p, GroupService svc) =>
            ToResult(await svc.SetRoleAsync(Me(p), id, uid, d.Role)));

        api.MapPatch("/groups/{id:guid}/members/{uid:guid}/deposit", async (Guid id, Guid uid, DepositDto d, ClaimsPrincipal p, GroupService svc) =>
            ToResult(await svc.SetDepositAsync(Me(p), id, uid, d.Paid)));

        api.MapPost("/groups/{id:guid}/flat-fee", async (Guid id, FlatFeeDto d, ClaimsPrincipal p, GroupService svc, Expenses.ExpenseService expenses) =>
            ToResult(await svc.FlatFeeAsync(Me(p), id, d.PayerId, d.Title, expenses)));

        api.MapPost("/groups/{id:guid}/share-link", async (Guid id, ClaimsPrincipal p, GroupService svc) =>
            ToResult(await svc.ShareLinkAsync(Me(p), id)));

        api.MapDelete("/groups/{id:guid}", async (Guid id, ClaimsPrincipal p, GroupService svc) =>
            ToResult(await svc.DeleteAsync(Me(p), id)));

        api.MapPost("/groups/{id:guid}/members", async (Guid id, AddMembersDto d, ClaimsPrincipal p, GroupService svc) =>
            ToResult(await svc.AddMembersAsync(Me(p), id, d.UserIds ?? [])));

        api.MapPost("/groups/{id:guid}/invites", async (Guid id, InviteDto d, ClaimsPrincipal p, GroupService svc) =>
            ToResult(await svc.InviteEmailsAsync(Me(p), id, d.Emails ?? [])));

        api.MapPost("/groups/join", async (JoinDto d, ClaimsPrincipal p, GroupService svc) =>
            ToResult(await svc.JoinByTokenAsync(Me(p), d.Token)));

        api.MapPost("/groups/{id:guid}/rotate-invite", async (Guid id, ClaimsPrincipal p, GroupService svc) =>
            ToResult(await svc.RotateInviteAsync(Me(p), id)));

        api.MapDelete("/groups/{id:guid}/members/{uid:guid}",
            async (Guid id, Guid uid, ClaimsPrincipal p, GroupService svc) =>
                ToResult(await svc.RemoveMemberAsync(Me(p), id, uid)));

        api.MapPost("/groups/{id:guid}/leave", async (Guid id, ClaimsPrincipal p, GroupService svc) =>
            ToResult(await svc.LeaveAsync(Me(p), id)));

        api.MapGet("/groups/{id:guid}/categories", async (Guid id, ClaimsPrincipal p, CategoryService cats) =>
            ToResult(await cats.ListAsync(Me(p), id)));

        api.MapPost("/groups/{id:guid}/categories", async (Guid id, CategoryDto d, ClaimsPrincipal p, CategoryService cats) =>
            ToResult(await cats.AddAsync(Me(p), id, d.Name)));

        api.MapPatch("/groups/{id:guid}/categories/{cid:guid}", async (Guid id, Guid cid, CategoryDto d, ClaimsPrincipal p, CategoryService cats) =>
            ToResult(await cats.RenameAsync(Me(p), id, cid, d.Name)));

        api.MapDelete("/groups/{id:guid}/categories/{cid:guid}", async (Guid id, Guid cid, ClaimsPrincipal p, CategoryService cats) =>
            ToResult(await cats.DeleteAsync(Me(p), id, cid)));
    }

    /// <summary>Anonymous surface: preview of an invite token for the /g/:token
    /// landing page (token possession authorizes; name only, no member details).</summary>
    public static void MapPublic(RouteGroupBuilder v1)
    {
        v1.MapGet("/invites/{token}", async (string token, AppDbContext db) =>
        {
            var g = await db.Groups.FirstOrDefaultAsync(x => x.InviteToken == token && x.DeletedAt == null);
            if (g is null)
                return ApiResults.Error("INVITE_ROTATED", "Invite invalid or rotated.", 410);
            var memberCount = await db.GroupMembers.CountAsync(m => m.GroupId == g.Id);
            return Results.Ok(new { name = g.Name, currency = g.Currency, member_count = memberCount });
        });
    }

    public sealed record CategoryDto(string Name);

    public sealed record CreateGroupDto(string Name, string? Currency, List<Guid>? MemberIds, List<string>? InviteEmails);
    public sealed record RenameGroupDto(string Name);
    public sealed record SettingsDto(decimal? Budget, int? BudgetAlertPct, string? Mode, decimal? FlatFee);
    public sealed record GroupStatusDto(string? Status);
    public sealed record TemplateDto(string Name, string? Currency, string Template, decimal? Budget, decimal? FlatFee);
    public sealed record RoleDto(string Role);
    public sealed record DepositDto(bool Paid);
    public sealed record FlatFeeDto(Guid PayerId, string? Title);
    public sealed record AddMembersDto(List<Guid>? UserIds);
    public sealed record InviteDto(List<string>? Emails);
    public sealed record JoinDto(string Token);
}
