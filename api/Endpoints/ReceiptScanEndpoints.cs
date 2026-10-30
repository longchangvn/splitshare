using System.Security.Claims;
using SplitShare.Api.Common;
using SplitShare.Api.Expenses;

namespace SplitShare.Api.Endpoints;

/// <summary>
/// Receipt scan: one photo → every receipt it shows (nothing is saved). A photo may hold
/// several receipts, so the response carries a <c>receipts</c> array; the flat and nested
/// single-receipt fields stay for the shipped single-scan form.
/// </summary>
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
            return Results.Ok(ToDto((IReadOnlyList<ReceiptSuggestion>)r.Data!));
        }).DisableAntiforgery().RequireRateLimiting(RateLimitPolicy);
    }

    /// <summary>
    /// <c>receipts</c> lists every receipt found in the photo, each with a one-line
    /// <c>summary</c> and its <c>amount_spent</c>. <c>total</c> / <c>confidence</c> /
    /// <c>warnings</c> / <c>receipt</c> describe the first one (legacy single-scan shape).
    /// </summary>
    public static object ToDto(IReadOnlyList<ReceiptSuggestion> receipts)
    {
        var first = receipts.Count > 0 ? receipts[0] : ReceiptSuggestion.Empty("not_a_receipt");
        return new
        {
            count = receipts.Count,
            receipts = receipts.Select(ReceiptDto).ToList(),
            total = first.Total,
            confidence = first.Confidence.Total,
            warnings = first.Warnings,
            receipt = ReceiptDto(first)
        };
    }

    public static object ReceiptDto(ReceiptSuggestion s) => new
    {
        summary = s.Summary,
        amount_spent = s.Total,
        total = s.Total, // alias kept for the pre-batch card helper
        merchant = s.Merchant,
        currency = s.Currency,
        date = s.Date,
        tax = s.Tax,
        tip = s.Tip,
        category = s.Category,
        confidence = s.Confidence,
        warnings = s.Warnings
    };
}
