using System.Security.Claims;
using System.Text.Json;
using SplitShare.Api.Auth;
using SplitShare.Api.Common;
using SplitShare.Api.Data;
using SplitShare.Api.Expenses;
using SplitShare.Api.Services;

namespace SplitShare.Api.Endpoints;

public static class ExpenseEndpoints
{
    private static Guid Me(ClaimsPrincipal p) => AuthEndpoints.CurrentUserId(p)!.Value;

    private static IResult ToResult(ExpenseOp r) => r.Ok ? Results.Ok(r.Data ?? new { status = "ok" })
        : ApiResults.Error(r.ErrorCode!, r.Error!, r.ErrorCode switch
        {
            "NOT_FOUND" => 404,
            "FORBIDDEN" => 403,
            "EXPENSE_LOCKED" => 403,
            "STALE_VERSION" => 409,
            _ => 422
        });

    private static object CreatedDto(ExpenseCreated c) => new
    {
        expense = ExpenseService.MapExpense(c.Expense),
        unsettled_user_ids = c.UnsettledUserIds,
        settlement_version = c.SettlementVersion
    };

    private static object UpdatedDto(ExpenseUpdated u) => new
    {
        expense = ExpenseService.MapExpense(u.Expense),
        unsettled_user_ids = u.UnsettledUserIds,
        settlement_version = u.SettlementVersion
    };

    private static bool TrySplitType(string s, out Models.SplitType t)
        => Enum.TryParse(s, ignoreCase: true, out t) && Enum.IsDefined(t);

    public static void Map(RouteGroupBuilder api)
    {
        api.MapPost("/groups/{id:guid}/expenses", async (Guid id, CreateExpenseDto d,
            ClaimsPrincipal p, ExpenseService svc, IdempotencyService idem, HttpRequest req) =>
        {
            var me = Me(p);
            var key = req.Headers["Idempotency-Key"].FirstOrDefault();
            var endpoint = $"POST /api/v1/groups/{id}/expenses";
            if (key is not null)
            {
                var (replay, status, json) = await idem.TryReplayAsync(key, endpoint);
                if (replay) return Results.Content(json, "application/json", statusCode: status);
            }
            if (!TrySplitType(d.SplitType, out var type))
                return ApiResults.Validation("split_type must be EQUAL|EXACT|PERCENT|SHARES.");
            var r = await svc.CreateAsync(me, id, d.Title, d.Description, d.Amount, d.PayerId,
                type, d.ParticipantIds ?? [],
                d.Exact?.Select(x => new ExactEntry(x.UserId, x.AmountCents)).ToList(),
                d.Percent?.Select(x => new PercentEntry(x.UserId, x.Percent)).ToList(),
                d.Shares?.Select(x => new ShareEntry(x.UserId, x.Shares)).ToList());
            if (!r.Ok) return ToResult(r);
            var body = JsonSerializer.Serialize(CreatedDto((ExpenseCreated)r.Data!));
            if (key is not null) await idem.StoreAsync(key, endpoint, 201, body);
            return Results.Content(body, "application/json", statusCode: 201);
        });

        api.MapPost("/groups/{id:guid}/expenses/preview-split", async (Guid id, PreviewDto d,
            ClaimsPrincipal p, ExpenseService svc) =>
        {
            if (!TrySplitType(d.SplitType, out var type))
                return ApiResults.Validation("split_type must be EQUAL|EXACT|PERCENT|SHARES.");
            var r = await svc.PreviewAsync(Me(p), id, d.Amount, type, d.ParticipantIds ?? [],
                d.Exact?.Select(x => new ExactEntry(x.UserId, x.AmountCents)).ToList(),
                d.Percent?.Select(x => new PercentEntry(x.UserId, x.Percent)).ToList(),
                d.Shares?.Select(x => new ShareEntry(x.UserId, x.Shares)).ToList());
            if (!r.Ok) return ToResult(r);
            var preview = (ExpensePreview)r.Data!;
            return Results.Ok(new { shares = preview.Shares.ToDictionary(kv => kv.Key.ToString(), kv => kv.Value) });
        });

        api.MapGet("/expenses/{id:guid}", async (Guid id, ClaimsPrincipal p, ExpenseService svc) =>
            ToResult(await svc.GetDetailAsync(Me(p), id)));

        api.MapPatch("/expenses/{id:guid}", async (Guid id, UpdateExpenseDto d,
            ClaimsPrincipal p, ExpenseService svc) =>
        {
            Models.SplitType? type = null;
            if (d.SplitType is not null)
            {
                if (!TrySplitType(d.SplitType, out var t))
                    return ApiResults.Validation("split_type must be EQUAL|EXACT|PERCENT|SHARES.");
                type = t;
            }
            var r = await svc.UpdateAsync(Me(p), id, d.ExpectedVersion, d.Title, d.Description,
                d.Amount, d.PayerId, type, d.ParticipantIds,
                d.Exact?.Select(x => new ExactEntry(x.UserId, x.AmountCents)).ToList(),
                d.Percent?.Select(x => new PercentEntry(x.UserId, x.Percent)).ToList(),
                d.Shares?.Select(x => new ShareEntry(x.UserId, x.Shares)).ToList());
            return !r.Ok ? ToResult(r) : Results.Ok(UpdatedDto((ExpenseUpdated)r.Data!));
        });

        api.MapPost("/expenses/{id:guid}/preview-edit", async (Guid id, PreviewEditDto d,
            ClaimsPrincipal p, ExpenseService svc) =>
        {
            Models.SplitType? type = null;
            if (d.SplitType is not null)
            {
                if (!TrySplitType(d.SplitType, out var t))
                    return ApiResults.Validation("split_type must be EQUAL|EXACT|PERCENT|SHARES.");
                type = t;
            }
            var r = await svc.PreviewEditAsync(Me(p), id, d.Amount, d.PayerId, type, d.ParticipantIds,
                d.Exact?.Select(x => new ExactEntry(x.UserId, x.AmountCents)).ToList(),
                d.Percent?.Select(x => new PercentEntry(x.UserId, x.Percent)).ToList(),
                d.Shares?.Select(x => new ShareEntry(x.UserId, x.Shares)).ToList());
            if (!r.Ok) return ToResult(r);
            var preview = (EditPreview)r.Data!;
            return Results.Ok(new
            {
                shares = preview.Shares.ToDictionary(kv => kv.Key.ToString(), kv => kv.Value),
                unsettled_user_ids = preview.UnsettledUserIds
            });
        });

        api.MapDelete("/expenses/{id:guid}", async (Guid id, ClaimsPrincipal p, ExpenseService svc) =>
        {
            var r = await svc.DeleteAsync(Me(p), id);
            if (!r.Ok) return ToResult(r);
            var del = (ExpenseDeleted)r.Data!;
            return Results.Ok(new
            {
                unsettled_user_ids = del.UnsettledUserIds,
                settlement_version = del.SettlementVersion
            });
        });

        api.MapPost("/expenses/{id:guid}/images", async (Guid id, HttpRequest req,
            ClaimsPrincipal p, ExpenseService svc) =>
        {
            if (!req.HasFormContentType) return ApiResults.Validation("multipart/form-data required.");
            var form = await req.ReadFormAsync();
            if (form.Files.Count == 0) return ApiResults.Validation("No files uploaded.");
            var ids = new List<object>();
            foreach (var f in form.Files)
            {
                await using var ms = new MemoryStream();
                await f.CopyToAsync(ms);
                var r = await svc.UploadImageAsync(Me(p), id,
                    f.FileName, f.ContentType, ms.ToArray());
                if (!r.Ok) return ToResult(r);
                var img = (Models.ExpenseImage)r.Data!;
                ids.Add(new { image_id = img.Id, mime = img.Mime, size_bytes = img.SizeBytes });
            }
            return Results.Created($"/api/v1/expenses/{id}", ids);
        }).DisableAntiforgery();

        api.MapDelete("/images/{id:guid}", async (Guid id, ClaimsPrincipal p, ExpenseService svc) =>
            ToResult(await svc.DeleteImageAsync(Me(p), id)));

        api.MapGet("/images/{id:guid}", async (Guid id, ClaimsPrincipal p,
            ExpenseService svc, IFileStore store) =>
        {
            var found = await svc.OpenImageAsync(Me(p), id);
            if (found is null) return ApiResults.Error("NOT_FOUND", "Image not found.", 404);
            var data = await store.OpenAsync(found.Value.Key);
            if (data is null) return ApiResults.Error("NOT_FOUND", "File missing.", 404);
            return Results.File(data.Value.Stream, data.Value.Mime);
        });
    }

    public sealed record MoneyEntry(Guid UserId, long AmountCents);
    public sealed record PctEntry(Guid UserId, decimal Percent);
    public sealed record ShrEntry(Guid UserId, int Shares);
    public sealed record CreateExpenseDto(string Title, string? Description, decimal Amount,
        Guid PayerId, string SplitType, List<Guid>? ParticipantIds,
        List<MoneyEntry>? Exact, List<PctEntry>? Percent, List<ShrEntry>? Shares);
    public sealed record PreviewDto(decimal Amount, string SplitType, List<Guid>? ParticipantIds,
        List<MoneyEntry>? Exact, List<PctEntry>? Percent, List<ShrEntry>? Shares);
    public sealed record UpdateExpenseDto(int ExpectedVersion, string? Title, string? Description,
        decimal? Amount, Guid? PayerId, string? SplitType, List<Guid>? ParticipantIds,
        List<MoneyEntry>? Exact, List<PctEntry>? Percent, List<ShrEntry>? Shares);
    public sealed record PreviewEditDto(decimal? Amount, Guid? PayerId, string? SplitType,
        List<Guid>? ParticipantIds, List<MoneyEntry>? Exact, List<PctEntry>? Percent, List<ShrEntry>? Shares);
}
