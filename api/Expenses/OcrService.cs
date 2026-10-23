namespace SplitShare.Api.Expenses;

/// <summary>Receipt scan result: only the final total (receipt currency). Confidence is "high" | "low" | null.</summary>
public sealed record ReceiptSuggestion(decimal? Total, string? Confidence, List<string> Warnings)
{
    public static ReceiptSuggestion Empty(params string[] warnings) => new(null, null, [.. warnings]);

    /// <summary>Flat string map for the legacy <c>POST /expenses/ocr</c> response.</summary>
    public Dictionary<string, string> ToDictionary() => Total is null
        ? []
        : new() { ["total"] = Total.Value.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture) };
}

/// <summary>Provider failure (timeout, non-2xx, unparseable output). Mapped to 503 OCR_PROVIDER_ERROR.</summary>
public sealed class OcrProviderException(string message, Exception? inner = null) : Exception(message, inner);

/// <summary>Receipt OCR. Disabled by default; wire a provider to enable (see capabilities).</summary>
public interface IOcrService
{
    bool Enabled { get; }
    Task<ReceiptSuggestion> ExtractAsync(byte[] image, string mime, CancellationToken ct = default);
}

public sealed class DisabledOcrService : IOcrService
{
    public bool Enabled => false;
    public Task<ReceiptSuggestion> ExtractAsync(byte[] image, string mime, CancellationToken ct = default)
        => Task.FromResult(ReceiptSuggestion.Empty());
}
