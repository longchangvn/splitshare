namespace SplitShare.Api.Expenses;

/// <summary>One receipt found in an image: "&lt;store&gt; items" and its final total.</summary>
public sealed record ReceiptSummary(string Summary, decimal Total);

/// <summary>Receipt OCR. Disabled by default; wire a provider to enable (see capabilities).</summary>
public interface IOcrService
{
    bool Enabled { get; }
    Task<IReadOnlyList<ReceiptSummary>> ExtractAsync(byte[] image, string mime, CancellationToken ct = default);
}

public sealed class DisabledOcrService(IConfiguration config) : IOcrService
{
    public bool Enabled => config.GetValue<bool>("Ocr:Enabled");
    public Task<IReadOnlyList<ReceiptSummary>> ExtractAsync(byte[] image, string mime, CancellationToken ct = default)
        => Task.FromResult<IReadOnlyList<ReceiptSummary>>([]);
}
