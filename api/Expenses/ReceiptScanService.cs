using SplitShare.Api.Data;
using SplitShare.Api.Groups;

namespace SplitShare.Api.Expenses;

/// <summary>Scan one receipt photo for a group and return its fields (nothing is saved).</summary>
public sealed class ReceiptScanService(AppDbContext db, IOcrService ocr, CategoryService categories,
    ILogger<ReceiptScanService> logger)
{
    /// <summary>Formats vision models accept; HEIC/HEIF are converted to JPEG by the client.</summary>
    public static readonly HashSet<string> ScanMimes = new(StringComparer.OrdinalIgnoreCase)
        { "image/jpeg", "image/png", "image/webp" };

    public async Task<ExpenseOp> ScanAsync(Guid actorId, Guid groupId, string? fileName, string? mime,
        byte[] bytes, CancellationToken ct = default)
    {
        if (!ocr.Enabled) return new(false, "OCR_UNAVAILABLE", "Receipt scanning is not enabled.");
        var group = await db.Groups.FindAsync([groupId], ct);
        if (group is null || group.DeletedAt is not null) return new(false, "NOT_FOUND", "Group not found.");
        if (await db.GroupMembers.FindAsync([groupId, actorId], ct) is null)
            return new(false, "FORBIDDEN", "Not a group member.");

        var norm = ExpenseService.NormalizeImageMime(fileName, mime);
        if (!ScanMimes.Contains(norm)) return new(false, "VALIDATION", $"Scan supports jpg png webp (got '{mime}').");
        if (bytes.Length == 0 || bytes.Length > ExpenseService.MaxImageBytes)
            return new(false, "VALIDATION", $"Image must be 1B-10MB (got {bytes.Length} bytes).");

        try
        {
            var categoryKeys = (await categories.EnsureAsync(groupId)).Select(c => c.Key).ToList();
            var suggestion = await ocr.ExtractAsync(
                ImageSanitizer.Sanitize(bytes, norm), norm,
                new OcrContext(group.Currency, categoryKeys), ct);

            // A foreign receipt is still returned; the client asks for the FX triple
            // (web) or a group-currency amount (mobile) before creating the expense.
            if (suggestion.Currency is not null
                && !string.Equals(suggestion.Currency, group.Currency, StringComparison.OrdinalIgnoreCase)
                && !suggestion.Warnings.Contains("currency_mismatch"))
                suggestion = suggestion with { Warnings = [.. suggestion.Warnings, "currency_mismatch"] };

            logger.LogInformation("Receipt scan ok group {GroupId} user {UserId} warnings {Warnings}",
                groupId, actorId, string.Join(",", suggestion.Warnings));
            return new(true, null, null, suggestion);
        }
        catch (OcrProviderException ex)
        {
            logger.LogWarning("Receipt scan failed group {GroupId} user {UserId}: {Reason}", groupId, actorId, ex.Message);
            return new(false, "OCR_PROVIDER_ERROR", "Receipt scan failed. Please try again or enter it manually.");
        }
    }
}
