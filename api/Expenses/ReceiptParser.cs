using System.Globalization;
using System.Text.Json;

namespace SplitShare.Api.Expenses;

/// <summary>
/// Turns raw model text into a validated <see cref="ReceiptSuggestion"/>. Model output is
/// untrusted: the total is re-validated with the same rules as expense create.
/// </summary>
public static class ReceiptParser
{
    public static ReceiptSuggestion Parse(string? modelText)
    {
        using var doc = ExtractJson(modelText)
            ?? throw new OcrProviderException("Provider returned no JSON object.");
        var root = doc.RootElement;
        if (root.ValueKind != JsonValueKind.Object)
            throw new OcrProviderException("Provider returned no JSON object.");

        if (root.TryGetProperty("is_receipt", out var isReceipt) && isReceipt.ValueKind == JsonValueKind.False)
            return ReceiptSuggestion.Empty("not_a_receipt");

        var confidence = Str(root, "confidence")?.Trim().ToLowerInvariant();
        if (confidence is not ("high" or "low")) confidence = null;

        var raw = Num(root, "total");
        if (raw is null) return new(null, null, ["total_missing"]);
        var total = Math.Round(raw.Value, 2, MidpointRounding.AwayFromZero);
        return ExpenseService.ParseAmount(total).Error is null
            ? new(total, confidence, [])
            : new(null, null, ["total_invalid"]);
    }

    /// <summary>Find the JSON object in model text (tolerates ```json fences and surrounding prose).</summary>
    private static JsonDocument? ExtractJson(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var start = text.IndexOf('{');
        var end = text.LastIndexOf('}');
        if (start < 0 || end <= start) return null;
        try { return JsonDocument.Parse(text[start..(end + 1)]); }
        catch (JsonException) { return null; }
    }

    private static string? Str(JsonElement obj, string name)
        => obj.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;

    private static decimal? Num(JsonElement obj, string name)
    {
        if (!obj.TryGetProperty(name, out var p)) return null;
        if (p.ValueKind == JsonValueKind.Number && p.TryGetDecimal(out var n)) return n;
        if (p.ValueKind == JsonValueKind.String
            && decimal.TryParse(p.GetString(), NumberStyles.Number, CultureInfo.InvariantCulture, out var s))
            return s;
        return null;
    }
}
