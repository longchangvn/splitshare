using System.Diagnostics;
using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace SplitShare.Api.Expenses;

/// <summary>
/// Ollama vision OCR (default model glm-ocr). The model only transcribes text
/// (its native "Text Recognition:" prompt); receipts are split and totals read
/// by <see cref="ReceiptTextParser"/>, because small OCR models do not follow
/// JSON-output instructions reliably.
/// </summary>
public sealed class OllamaOcrService(IHttpClientFactory http, IConfiguration config, ILogger<OllamaOcrService> log) : IOcrService
{
    public const string HttpClientName = "ocr";

    public bool Enabled => config.GetValue<bool>("Ocr:Enabled");

    public async Task<IReadOnlyList<ReceiptSummary>> ExtractAsync(byte[] image, string mime, CancellationToken ct = default)
    {
        var model = config["Ocr:Model"] ?? "glm-ocr:latest";
        var sw = Stopwatch.StartNew();
        using var res = await http.CreateClient(HttpClientName).PostAsJsonAsync("api/chat", new
        {
            model,
            stream = false,
            options = new { temperature = 0 },
            messages = new[] { new { role = "user", content = "Text Recognition:", images = new[] { Convert.ToBase64String(image) } } }
        }, ct);
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<JsonElement>(ct);
        var receipts = ReceiptTextParser.Parse(body.GetProperty("message").GetProperty("content").GetString() ?? "");
        log.LogInformation("OCR ok model={Model} latencyMs={Ms} receipts={Count}", model, sw.ElapsedMilliseconds, receipts.Count);
        return receipts;
    }
}

/// <summary>
/// Splits OCR text into receipts: each receipt ends at its "TOTAL $x.xx" line and
/// its store is the first non-empty line of that block.
/// </summary>
public static partial class ReceiptTextParser
{
    [GeneratedRegex(@"^(?:grand\s+)?total\s*:?\s*\$?\s*([\d,]+\.\d{2})$", RegexOptions.IgnoreCase)]
    private static partial Regex TotalLine();

    [GeneratedRegex(@"\b(super\s*market|market|store|inc\.?|llc)\b|#\s*\d+", RegexOptions.IgnoreCase)]
    private static partial Regex StoreNoise();

    [GeneratedRegex(@"\s+")]
    private static partial Regex Spaces();

    public static IReadOnlyList<ReceiptSummary> Parse(string text)
    {
        var receipts = new List<ReceiptSummary>();
        string? store = null;
        foreach (var line in text.Split('\n').Select(l => l.Trim()).Where(l => l.Length > 0))
        {
            store ??= line;
            var m = TotalLine().Match(line);
            if (!m.Success) continue;
            var total = decimal.Parse(m.Groups[1].Value.Replace(",", ""), CultureInfo.InvariantCulture);
            var name = Spaces().Replace(StoreNoise().Replace(store, " "), " ").Trim().ToLowerInvariant();
            if (ExpenseService.ParseAmount(total).Error is null)
                receipts.Add(new($"{(name.Length > 0 ? name : "receipt")} items", total));
            store = null;
        }
        return receipts;
    }
}
