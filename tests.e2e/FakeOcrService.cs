using SplitShare.Api.Expenses;

namespace SplitShare.E2E;

/// <summary>
/// Deterministic <see cref="IOcrService"/> stand-in: returns one fixed receipt for
/// any image, so scan happy paths assert without a vision provider (and without
/// network/quota cost). <see cref="Enabled"/> is the single gate the API checks,
/// so it reports true — /capabilities and the scan endpoints take the happy path.
/// </summary>
public sealed class FakeOcrService : IOcrService
{
    /// <summary>Matches tests/fixtures/receipt-sample.jpg (the suite's known total).</summary>
    public const decimal SampleTotal = 21.00m;

    public bool Enabled => true;

    /// <summary>Number of scans served — lets tests prove the provider was hit.</summary>
    public int CallCount { get; private set; }

    public Task<IReadOnlyList<ReceiptSuggestion>> ExtractAsync(byte[] image, string mime,
        OcrContext? context = null, CancellationToken ct = default)
    {
        if (image.Length == 0)
            throw new OcrProviderException("empty image");
        CallCount++;
        IReadOnlyList<ReceiptSuggestion> receipts =
        [
            new ReceiptSuggestion(SampleTotal, ReceiptConfidence.None, [],
                Merchant: "E2E Test Cafe",
                Currency: context?.GroupCurrency ?? "USD",
                Date: DateOnly.FromDateTime(DateTime.UtcNow),
                Category: context?.CategoryKeys.FirstOrDefault())
        ];
        return Task.FromResult(receipts);
    }
}
