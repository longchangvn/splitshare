using System.Text.Json;
using SplitShare.Api.Common;
using SplitShare.Api.Data;
using SplitShare.Api.Services;

namespace SplitShare.Api.Endpoints;

// Auth stubbed until task 3.4: group existence is the only gate.
public static class SettlementEndpoints
{
    public static void Map(RouteGroupBuilder v1)
    {
        v1.MapGet("/groups/{id:guid}/settlement", async (Guid id, LedgerService ledger) =>
        {
            if (await ledger.ComputeNetsAsync(id) is not { } snapshot)
                return ApiResults.NotFound("Group not found.");
            var (plan, _) = await ledger.RecomputeAsync(id, snapshot);
            return Results.Ok(PlanDto(plan, LedgerService.RawDebts(snapshot)));
        });

        v1.MapGet("/groups/{id:guid}/settlement/history", async (Guid id, AppDbContext db, LedgerService ledger) =>
        {
            if (await ledger.GetGroupAsync(id) is null)
                return ApiResults.NotFound("Group not found.");
            var items = db.SettlementPlans.Where(s => s.GroupId == id)
                .OrderByDescending(s => s.VersionSeq).Take(100).ToList()
                .Select(PlanDto).ToList();
            return Results.Ok(items);
        });

        v1.MapGet("/groups/{id:guid}/settlement/history/{v:int}", async (Guid id, int v, AppDbContext db, LedgerService ledger) =>
        {
            if (await ledger.GetGroupAsync(id) is null)
                return ApiResults.NotFound("Group not found.");
            var plan = db.SettlementPlans
                .FirstOrDefault(s => s.GroupId == id && s.VersionSeq == v);
            return plan is null ? ApiResults.NotFound($"Plan v{v} not found.") : Results.Ok(PlanDto(plan));
        });
    }

    // raw_debts is only present on the live plan; history rows store optimizer output only.
    private static object PlanDto(Models.SettlementPlan p) => PlanDto(p, null);

    private static object PlanDto(Models.SettlementPlan p, List<LedgerService.RawDebt>? rawDebts) => new
    {
        group_id = p.GroupId,
        version = p.VersionSeq,
        computed_at = p.ComputedAt,
        inputs_hash = p.InputsHash,
        transfers = JsonSerializer.Deserialize<object>(p.TransfersJson),
        explanation = JsonSerializer.Deserialize<object>(p.ExplanationJson),
        readonly_history = false,
        raw_debts = rawDebts
    };
}
