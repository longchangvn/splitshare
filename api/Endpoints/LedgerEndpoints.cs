using System.Security.Claims;
using SplitShare.Api.Auth;
using SplitShare.Api.Common;
using SplitShare.Api.Data;

namespace SplitShare.Api.Endpoints;

public static class LedgerEndpoints
{
    private static Guid Me(ClaimsPrincipal p) => AuthEndpoints.CurrentUserId(p)!.Value;

    public static void Map(RouteGroupBuilder api)
    {
        api.MapGet("/groups/{id:guid}/ledger", async (Guid id, ClaimsPrincipal p,
            string? type, string? q, string? status,
            long? min_amount, long? max_amount, DateTime? from_date, DateTime? to_date,
            Guid? payer_id, string? sort, int? page, int? limit,
            Services.LedgerService ledger) =>
        {
            var me = Me(p);
            if (!await ledger.CanViewAsync(id, me))
                return ApiResults.Error("FORBIDDEN", "Not a group member.", 403);
            var t = (type ?? "all").ToLower();
            if (t is not ("all" or "expense" or "payment"))
                return ApiResults.Validation("type must be all|expense|payment.");
            if (status is not null && status.ToUpperInvariant() is not ("OPEN" or "LOCKED"))
                return ApiResults.Validation("status must be OPEN|LOCKED.");
            var filters = new Services.LedgerService.LedgerFilters(
                t, q, status, min_amount, max_amount, from_date, to_date, payer_id,
                sort == "created_at" ? "created_at" : "-created_at",
                Math.Max(1, page ?? 1), Math.Clamp(limit ?? 20, 1, 100));
            var (items, total) = await ledger.GetLedgerAsync(id, me, filters);
            return Results.Ok(new { items, page = filters.Page, limit = filters.Limit, total });
        });

        api.MapGet("/groups/{id:guid}/me", async (Guid id, ClaimsPrincipal p,
            Services.LedgerService ledger) =>
        {
            var view = await ledger.BuildMeAsync(id, Me(p));
            return view is null ? ApiResults.Error("NOT_FOUND", "Group not found.", 404) : Results.Ok(view);
        });

        api.MapGet("/me/balances", async (ClaimsPrincipal p, Services.LedgerService ledger) =>
            Results.Ok(await ledger.BuildAllAsync(Me(p))));

        api.MapGet("/groups/{id:guid}/summary", async (Guid id, ClaimsPrincipal p,
            Services.LedgerService ledger) =>
        {
            if (!await ledger.CanViewAsync(id, Me(p)))
                return ApiResults.Error("FORBIDDEN", "Not a group member.", 403);
            var summary = await ledger.BuildSummaryAsync(id);
            return summary is null ? ApiResults.Error("NOT_FOUND", "Group not found.", 404) : Results.Ok(summary);
        });
    }
}
