using System.Security.Claims;
using System.Text.Json;
using SplitShare.Api.Auth;
using SplitShare.Api.Common;
using SplitShare.Api.Payments;
using SplitShare.Api.Services;

namespace SplitShare.Api.Endpoints;

public static class PaymentEndpoints
{
    private static Guid Me(ClaimsPrincipal p) => AuthEndpoints.CurrentUserId(p)!.Value;

    private static IResult ToResult(PaymentOp r) => r.Ok ? Results.Ok(r.Data ?? new { status = "ok" })
        : ApiResults.Error(r.ErrorCode!, r.Error!, r.ErrorCode switch
        {
            "NOT_FOUND" => 404,
            "FORBIDDEN" => 403,
            "EXPENSE_LOCKED" => 403,
            "ALREADY_SETTLED" => 422,
            "OVERPAYMENT" => 422,
            _ => 422
        });

    private static object MapPayment(Models.Payment p) => new
    {
        payment_id = p.Id,
        group_id = p.GroupId,
        from_user_id = p.FromUserId,
        to_user_id = p.ToUserId,
        amount_cents = p.AmountCents,
        method = p.Method,
        note = p.Note,
        created_by = p.CreatedBy,
        created_at = p.CreatedAt,
        status = p.Status.ToString().ToUpperInvariant()
    };

    public static void Map(RouteGroupBuilder api)
    {
        api.MapPost("/groups/{id:guid}/payments", async (Guid id, RecordPaymentDto d,
            ClaimsPrincipal p, PaymentService svc, IdempotencyService idem, HttpRequest req) =>
        {
            var key = req.Headers["Idempotency-Key"].FirstOrDefault();
            var endpoint = $"POST /api/v1/groups/{id}/payments";
            if (key is not null)
            {
                var (replay, status, json) = await idem.TryReplayAsync(key, endpoint);
                if (replay) return Results.Content(json, "application/json", statusCode: status);
            }
            var r = await svc.RecordAsync(Me(p), id, d.FromUserId, d.ToUserId, d.Amount, d.Method, d.Note);
            if (!r.Ok) return ToResult(r);
            var rec = (PaymentRecorded)r.Data!;
            var body = JsonSerializer.Serialize(new
            {
                payment = MapPayment(rec.Payment),
                fully_settled = rec.FullySettled,
                settlement_version = rec.SettlementVersion
            });
            if (key is not null) await idem.StoreAsync(key, endpoint, 201, body);
            return Results.Content(body, "application/json", statusCode: 201);
        });

        api.MapPost("/payments/{id:guid}/reverse", async (Guid id,
            ClaimsPrincipal p, PaymentService svc) =>
        {
            var r = await svc.ReverseAsync(Me(p), id);
            if (!r.Ok) return ToResult(r);
            var rev = (PaymentReversed)r.Data!;
            return Results.Ok(new
            {
                payment = MapPayment(rev.Payment),
                settlement_version = rev.SettlementVersion
            });
        });
    }

    public sealed record RecordPaymentDto(Guid FromUserId, Guid ToUserId, decimal Amount, string Method, string? Note);
}
