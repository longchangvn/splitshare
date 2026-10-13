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
            "GROUP_FULL" => 403,
            "INVITE_ROTATED" => 410,
            "HAS_OPEN_BALANCE" => 422,
            _ => 422
        });

    private static Guid Me(ClaimsPrincipal p) => AuthEndpoints.CurrentUserId(p)!.Value;

    private static async Task<object> DetailAsync(AppDbContext db, Guid groupId, Guid me)
    {
        var g = (await db.Groups.FindAsync(groupId))!;
        var members = await db.GroupMembers.Where(m => m.GroupId == groupId).ToListAsync();
        var ids = members.Select(m => m.UserId).ToList();
        var users = await db.Users.Where(u => ids.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => new { u.DisplayName, u.Username });
        return new
        {
            group_id = g.Id,
            name = g.Name,
            currency = g.Currency,
            my_role = members.FirstOrDefault(m => m.UserId == me)?.Role,
            members = members.Select(m => new
            {
                user_id = m.UserId,
                role = m.Role,
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
                .Select(g => new { group_id = g.Id, name = g.Name, currency = g.Currency }).ToListAsync();
            return Results.Ok(groups);
        });

        api.MapGet("/groups/{id:guid}", async (Guid id, ClaimsPrincipal p, AppDbContext db, GroupService svc) =>
        {
            var me = Me(p);
            if (await svc.RoleAsync(id, me) is null) return ApiResults.Error("FORBIDDEN", "Not a group member.", 403);
            return Results.Ok(await DetailAsync(db, id, me));
        });

        api.MapPatch("/groups/{id:guid}", async (Guid id, RenameGroupDto d, ClaimsPrincipal p, GroupService svc) =>
            ToResult(await svc.RenameAsync(Me(p), id, d.Name)));

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
    }

    public sealed record CreateGroupDto(string Name, string? Currency, List<Guid>? MemberIds, List<string>? InviteEmails);
    public sealed record RenameGroupDto(string Name);
    public sealed record AddMembersDto(List<Guid>? UserIds);
    public sealed record InviteDto(List<string>? Emails);
    public sealed record JoinDto(string Token);
}
