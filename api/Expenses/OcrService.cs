using System.Globalization;

namespace SplitShare.Api.Expenses;

/// <summary>Per-field confidence from the model. Any value is "high", "low" or null (unknown).</summary>
public sealed record ReceiptConfidence(
    string? Total = null,
    string? Date = null,
    string? Merchant = null,
    string? Category = null)
{
    public static readonly ReceiptConfidence None = new();
}

/// <summary>
/// Receipt scan result. Every field is nullable: the model may not read it, and the
/// values are normalized/validated server-side before they reach a client. The batch
/// UI pre-fills editable cards from this; nothing is saved by a scan.
/// </summary>
public sealed record ReceiptSuggestion(
    decimal? Total,
    ReceiptConfidence Confidence,
    List<string> Warnings,
    string? Merchant = null,
    string? Currency = null,
    DateOnly? Date = null,
    decimal? Tax = null,
    decimal? Tip = null,
    string? Category = null)
{
    public static ReceiptSuggestion Empty(params string[] warnings) =>
        new(null, ReceiptConfidence.None, [.. warnings]);

    /// <summary>Flat string map for the legacy <c>POST /expenses/ocr</c> response.</summary>
    public Dictionary<string, string> ToDictionary() => Total is null
        ? []
        : new() { ["total"] = Total.Value.ToString("0.00", CultureInfo.InvariantCulture) };
}

/// <summary>
/// Group-scoped context for a scan: the currency the expense will be recorded in and
/// the category keys that group currently accepts. The provider is told both so it can
/// return a usable category and flag foreign-currency receipts.
/// </summary>
public sealed record OcrContext(string GroupCurrency, IReadOnlyList<string> CategoryKeys);

/// <summary>Provider failure (timeout, non-2xx, unparseable output). Mapped to 503 OCR_PROVIDER_ERROR.</summary>
public sealed class OcrProviderException(string message, Exception? inner = null) : Exception(message, inner);

/// <summary>Receipt OCR. Disabled by default; wire a provider to enable (see capabilities).</summary>
public interface IOcrService
{
    bool Enabled { get; }
    Task<ReceiptSuggestion> ExtractAsync(byte[] image, string mime, OcrContext? context = null,
        CancellationToken ct = default);
}

public sealed class DisabledOcrService : IOcrService
{
    public bool Enabled => false;
    public Task<ReceiptSuggestion> ExtractAsync(byte[] image, string mime, OcrContext? context = null,
        CancellationToken ct = default)
        => Task.FromResult(ReceiptSuggestion.Empty());
}
