using System.Security.Claims;
using SplitShare.Api.Common;
using SplitShare.Api.Expenses;

namespace SplitShare.Api.Endpoints;

/// <summary>Receipt scan: photo → receipt total for the Add expense form (nothing is saved).</summary>
public static class ReceiptScanEndpoints
{
    public const string RateLimitPolicy = "ocr-user";

    public static void Map(RouteGroupBuilder api)
    {
        api.MapPost("/groups/{id:guid}/expenses/scan", async (Guid id, HttpRequest req,
            ClaimsPrincipal p, ReceiptScanService svc, CancellationToken ct) =>
        {
            if (!req.HasFormContentType) return ApiResults.Validation("multipart/form-data required.");
            var form = await req.ReadFormAsync(ct);
            var file = form.Files.GetFile("file") ?? form.Files.FirstOrDefault();
            if (file is null) return ApiResults.Validation("No file uploaded.");
            if (file.Length is 0 or > ExpenseService.MaxImageBytes)
                return ApiResults.Validation($"Image must be 1B-10MB (got {file.Length}B).");

            await using var ms = new MemoryStream();
            await file.CopyToAsync(ms, ct);
            var r = await svc.ScanAsync(AuthEndpoints.CurrentUserId(p)!.Value, id,
                file.FileName, file.ContentType, ms.ToArray(), ct);
            if (!r.Ok)
                return ApiResults.Error(r.ErrorCode!, r.Error!, r.ErrorCode switch
                {
                    "NOT_FOUND" => 404,
                    "FORBIDDEN" => 403,
                    "OCR_UNAVAILABLE" => 501,
                    "OCR_PROVIDER_ERROR" => 503,
                    _ => 422
                });
            return Results.Ok(ToDto((ReceiptSuggestion)r.Data!));
        }).DisableAntiforgery().RequireRateLimiting(RateLimitPolicy);
    }

    /// <summary>
    /// Additive shape: the flat total/confidence/warnings fields keep the shipped
    /// single-scan client working, while <c>receipt</c> carries the batch fields.
    /// </summary>
    public static object ToDto(ReceiptSuggestion s) => new
    {
        total = s.Total,
        confidence = s.Confidence.Total,
        warnings = s.Warnings,
        receipt = new
        {
            merchant = s.Merchant,
            total = s.Total,
            currency = s.Currency,
            date = s.Date,
            tax = s.Tax,
            tip = s.Tip,
            category = s.Category,
            confidence = s.Confidence
        }
    };
}
