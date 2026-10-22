using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SplitShare.Api.Auth;
using SplitShare.Api.Common;
using SplitShare.Api.Data;
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
        proof_ref = p.ProofRef,
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
            var r = await svc.RecordAsync(Me(p), id, d.FromUserId, d.ToUserId, d.Amount, d.Method, d.Note, d.ProofRef);
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

        api.MapPost("/payments/{id:guid}/proof", async (Guid id, HttpRequest req,
            ClaimsPrincipal p, AppDbContext db, Expenses.IFileStore store, Groups.GroupStatusPolicy policy) =>
        {
            if (!req.HasFormContentType) return ApiResults.Error("VALIDATION", "multipart/form-data required.", 422);
            var pay = await db.Payments.FindAsync(id);
            if (pay is null) return ApiResults.Error("NOT_FOUND", "Payment not found.", 404);
            var role = (await db.GroupMembers.FindAsync(pay.GroupId, Me(p)))?.Role;
            if (Me(p) != pay.FromUserId && Me(p) != pay.ToUserId && role is not ("owner" or "treasurer"))
                return ApiResults.Error("FORBIDDEN", "Only parties, owner or treasurer.", 403);
            var write = await policy.CheckWriteAsync(pay.GroupId, Me(p));
            if (!write.Allowed) return ApiResults.Error(write.ErrorCode!, write.Error!, write.ErrorCode == "NOT_FOUND" ? 404 : 403);
            var form = await req.ReadFormAsync();
            var f = form.Files.FirstOrDefault();
            if (f is null) return ApiResults.Error("VALIDATION", "No file uploaded.", 422);
            if (!Expenses.ExpenseService.AllowedMimes.Contains(f.ContentType))
                return ApiResults.Error("VALIDATION", "Allowed: jpg png webp heic.", 422);
            await using var ms = new MemoryStream();
            await f.CopyToAsync(ms);
            var bytes = ms.ToArray();
            if (bytes.Length == 0 || bytes.Length > Expenses.ExpenseService.MaxImageBytes)
                return ApiResults.Error("VALIDATION", "File must be 1B-10MB.", 422);
            var key = await store.SaveAsync(id, f.FileName, f.ContentType, new MemoryStream(bytes));
            db.PaymentProofs.Add(new Models.PaymentProof
            {
                PaymentId = id, StorageKey = key, Mime = f.ContentType,
                SizeBytes = bytes.Length, UploadedBy = Me(p)
            });
            await db.SaveChangesAsync();
            return Results.Created($"/api/v1/payments/{id}", new { status = "ok", has_proof = true });
        }).DisableAntiforgery();

        api.MapGet("/payments/{id:guid}/proof", async (Guid id, ClaimsPrincipal p,
            AppDbContext db, Services.LedgerService ledger, Expenses.IFileStore store) =>
        {
            var pay = await db.Payments.FindAsync(id);
            if (pay is null) return ApiResults.Error("NOT_FOUND", "Payment not found.", 404);
            if (!await ledger.CanViewAsync(pay.GroupId, Me(p)))
                return ApiResults.Error("FORBIDDEN", "Not a group member.", 403);
            var proof = await db.PaymentProofs.Where(x => x.PaymentId == id)
                .OrderByDescending(x => x.CreatedAt).FirstOrDefaultAsync();
            if (proof is null) return ApiResults.Error("NOT_FOUND", "No proof attached.", 404);
            var data = await store.OpenAsync(proof.StorageKey);
            if (data is null) return ApiResults.Error("NOT_FOUND", "File missing.", 404);
            return Results.File(data.Value.Stream, data.Value.Mime);
        });

        api.MapGet("/me/handles", async (ClaimsPrincipal p, AppDbContext db) =>
            Results.Ok(await db.PaymentHandles.Where(h => h.UserId == Me(p))
                .OrderBy(h => h.CreatedAt).Select(h => new
                    { handle_id = h.Id, label = h.Label, details = h.Details }).ToListAsync()));

        api.MapPost("/me/handles", async (HandleDto d, ClaimsPrincipal p, AppDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(d.Label) || d.Label.Trim().Length > 64)
                return ApiResults.Error("VALIDATION", "label 1-64 chars required.", 422);
            if (string.IsNullOrWhiteSpace(d.Details) || d.Details.Trim().Length > 280)
                return ApiResults.Error("VALIDATION", "details 1-280 chars required.", 422);
            var h = new Models.PaymentHandle
                { UserId = Me(p), Label = d.Label.Trim(), Details = d.Details.Trim() };
            db.PaymentHandles.Add(h);
            await db.SaveChangesAsync();
            return Results.Created($"/api/v1/me/handles",
                new { handle_id = h.Id, label = h.Label, details = h.Details });
        });

        api.MapDelete("/me/handles/{hid:guid}", async (Guid hid, ClaimsPrincipal p, AppDbContext db) =>
        {
            var h = await db.PaymentHandles.FirstOrDefaultAsync(x => x.Id == hid && x.UserId == Me(p));
            if (h is null) return ApiResults.Error("NOT_FOUND", "Handle not found.", 404);
            db.PaymentHandles.Remove(h);
            await db.SaveChangesAsync();
            return Results.Ok(new { status = "deleted" });
        });

        api.MapGet("/users/{uid:guid}/handles", async (Guid uid, ClaimsPrincipal p,
            AppDbContext db) =>
        {
            // Visible only to users sharing a group.
            var me = Me(p);
            var myGroups = await db.GroupMembers.Where(m => m.UserId == me).Select(m => m.GroupId).ToListAsync();
            var shared = await db.GroupMembers.AnyAsync(m => m.UserId == uid && myGroups.Contains(m.GroupId));
            if (!shared && uid != me)
                return ApiResults.Error("FORBIDDEN", "No shared group.", 403);
            return Results.Ok(await db.PaymentHandles.Where(h => h.UserId == uid)
                .OrderBy(h => h.CreatedAt).Select(h => new
                    { handle_id = h.Id, label = h.Label, details = h.Details }).ToListAsync());
        });
    }

    public sealed record RecordPaymentDto(Guid FromUserId, Guid ToUserId, decimal Amount, string Method, string? Note, string? ProofRef);
    public sealed record HandleDto(string Label, string Details);
}
