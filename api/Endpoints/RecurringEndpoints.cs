using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SplitShare.Api.Auth;
using SplitShare.Api.Common;
using SplitShare.Api.Data;
using SplitShare.Api.Services;

namespace SplitShare.Api.Endpoints;

public static class RecurringEndpoints
{
    private static Guid Me(ClaimsPrincipal p) => AuthEndpoints.CurrentUserId(p)!.Value;

    private static async Task<IResult?> WriteGuardAsync(Groups.GroupStatusPolicy policy, Guid groupId, Guid actorId)
    {
        var write = await policy.CheckWriteAsync(groupId, actorId);
        return write.Allowed ? null : ApiResults.Error(write.ErrorCode!, write.Error!, write.ErrorCode == "NOT_FOUND" ? 404 : 403);
    }

    public static async Task Materialize(Guid groupId, RecurringService recurring)
    {
        try { await recurring.MaterializeDueAsync(groupId); }
        catch { /* reads must not fail on recurring */ }
    }

    private static object Map(Models.RecurringRule r) => new
    {
        rule_id = r.Id,
        group_id = r.GroupId,
        title = r.Title,
        amount_cents = r.AmountCents,
        split_type = r.SplitType.ToString().ToUpperInvariant(),
        payer_id = r.PayerId,
        participant_ids = JsonSerializer.Deserialize<List<Guid>>(r.ParticipantIdsJson),
        frequency = r.Frequency,
        next_run_at = r.NextRunAt,
        active = r.Active,
        last_run_at = r.LastRunAt
    };

    public static void Map(RouteGroupBuilder api)
    {
        api.MapGet("/groups/{id:guid}/recurring", async (Guid id, ClaimsPrincipal p, AppDbContext db, Groups.GroupService svc) =>
        {
            if (await svc.RoleAsync(id, Me(p)) is null) return ApiResults.Error("FORBIDDEN", "Not a group member.", 403);
            var rules = await db.RecurringRules.Where(r => r.GroupId == id).OrderBy(r => r.NextRunAt).ToListAsync();
            return Results.Ok(rules.Select(Map).ToList());
        });

        api.MapPost("/groups/{id:guid}/recurring", async (Guid id, RuleDto d, ClaimsPrincipal p,
            AppDbContext db, Groups.GroupService svc, Groups.GroupStatusPolicy policy) =>
        {
            var me = Me(p);
            var role = await svc.RoleAsync(id, me);
            if (role is not ("owner" or "treasurer")) return ApiResults.Error("FORBIDDEN", "Owner or treasurer only.", 403);
            if (await WriteGuardAsync(policy, id, me) is { } denied) return denied;
            if (string.IsNullOrWhiteSpace(d.Title) || d.Title.Trim().Length > 100)
                return ApiResults.Validation("Title 1-100 chars required.");
            var (cents, amtErr) = Expenses.ExpenseService.ParseAmount(d.Amount);
            if (amtErr is not null) return ApiResults.Validation(amtErr);
            if (!Enum.TryParse<Models.SplitType>(d.SplitType, true, out var type) || !Enum.IsDefined(type))
                return ApiResults.Validation("split_type must be EQUAL|EXACT|PERCENT|SHARES.");
            if (type != Models.SplitType.Equal)
                return ApiResults.Validation("Recurring rules support EQUAL only (keep it predictable).");
            var freq = (d.Frequency ?? "monthly").Trim().ToLowerInvariant();
            if (!RecurringService.ValidFrequency(freq)) return ApiResults.Validation("frequency must be weekly|monthly.");
            var current = await db.GroupMembers.Where(m => m.GroupId == id).Select(m => m.UserId).ToListAsync();
            if (!current.Contains(d.PayerId)) return ApiResults.Validation("Payer must be an active member.");
            if (d.ParticipantIds is null || d.ParticipantIds.Count is 0 or > 50
                || d.ParticipantIds.Any(x => !current.Contains(x)))
                return ApiResults.Validation("1-50 active participants required.");
            var r = new Models.RecurringRule
            {
                GroupId = id, Title = d.Title.Trim(), AmountCents = cents, SplitType = type,
                PayerId = d.PayerId, ParticipantIdsJson = JsonSerializer.Serialize(d.ParticipantIds.Distinct().ToList()),
                Frequency = freq, NextRunAt = d.StartsAt ?? RecurringService.Advance(DateTime.UtcNow, freq),
                Active = d.Active ?? true, CreatedBy = me
            };
            db.RecurringRules.Add(r);
            await db.SaveChangesAsync();
            return Results.Created($"/api/v1/groups/{id}/recurring", Map(r));
        });

        api.MapPatch("/groups/{id:guid}/recurring/{rid:guid}", async (Guid id, Guid rid, RulePatchDto d,
            ClaimsPrincipal p, AppDbContext db, Groups.GroupService svc, Groups.GroupStatusPolicy policy) =>
        {
            var me = Me(p);
            var role = await svc.RoleAsync(id, me);
            if (role is not ("owner" or "treasurer")) return ApiResults.Error("FORBIDDEN", "Owner or treasurer only.", 403);
            if (await WriteGuardAsync(policy, id, me) is { } denied) return denied;
            var r = await db.RecurringRules.FirstOrDefaultAsync(x => x.Id == rid && x.GroupId == id);
            if (r is null) return ApiResults.Error("NOT_FOUND", "Rule not found.", 404);
            if (d.Active is not null) r.Active = d.Active.Value;
            if (d.Title is not null)
            {
                if (d.Title.Trim().Length is 0 or > 100) return ApiResults.Validation("Title 1-100 chars required.");
                r.Title = d.Title.Trim();
            }
            if (d.Amount is not null)
            {
                var (cents, err) = Expenses.ExpenseService.ParseAmount(d.Amount.Value);
                if (err is not null) return ApiResults.Validation(err);
                r.AmountCents = cents;
            }
            await db.SaveChangesAsync();
            return Results.Ok(Map(r));
        });

        api.MapDelete("/groups/{id:guid}/recurring/{rid:guid}", async (Guid id, Guid rid,
            ClaimsPrincipal p, AppDbContext db, Groups.GroupService svc, Groups.GroupStatusPolicy policy) =>
        {
            var me = Me(p);
            var role = await svc.RoleAsync(id, me);
            if (role is not ("owner" or "treasurer")) return ApiResults.Error("FORBIDDEN", "Owner or treasurer only.", 403);
            if (await WriteGuardAsync(policy, id, me) is { } denied) return denied;
            var r = await db.RecurringRules.FirstOrDefaultAsync(x => x.Id == rid && x.GroupId == id);
            if (r is null) return ApiResults.Error("NOT_FOUND", "Rule not found.", 404);
            db.RecurringRules.Remove(r);
            await db.SaveChangesAsync();
            return Results.Ok(new { status = "deleted" });
        });
    }

    public sealed record RuleDto(string Title, decimal Amount, string SplitType, Guid PayerId,
        List<Guid>? ParticipantIds, string? Frequency, DateTime? StartsAt, bool? Active);
    public sealed record RulePatchDto(string? Title, decimal? Amount, bool? Active);
}
