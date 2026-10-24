using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace SplitShare.Api.Expenses;

/// <summary>
/// Turns raw model text into a validated <see cref="ReceiptSuggestion"/>. Model output is
/// untrusted: every field is re-validated with the same rules as expense create, and
/// anything unusable becomes null plus a warning so the UI can ask for manual entry.
/// </summary>
public static class ReceiptParser
{
    private const int MaxMerchantLength = 100;
    private const int MaxCategoryKeyLength = 32;

    public static ReceiptSuggestion Parse(string? modelText, OcrContext? context = null)
    {
        using var doc = ExtractJson(modelText)
            ?? throw new OcrProviderException("Provider returned no JSON object.");
        var root = doc.RootElement;
        if (root.ValueKind != JsonValueKind.Object)
            throw new OcrProviderException("Provider returned no JSON object.");

        // Some models wrap the payload: {"receipt": {...}}. Read fields from the inner
        // object when present, but keep is_receipt visible from either level.
        var source = root;
        if (root.TryGetProperty("receipt", out var nested) && nested.ValueKind == JsonValueKind.Object)
            source = nested;

        var warnings = new List<string>();
        var isReceipt = Bool(source, "is_receipt") ?? Bool(root, "is_receipt") ?? true;

        var merchant = CleanText(Str(source, "merchant"), MaxMerchantLength);
        var currency = Currency(Str(source, "currency"));
        var (date, dateWarning) = ParseDate(Str(source, "date"));
        if (dateWarning is not null) warnings.Add(dateWarning);

        var total = ParseTotal(Num(source, "total"), out var totalWarning);
        var tax = ParseExtra(Num(source, "tax"));
        var tip = ParseExtra(Num(source, "tip"));
        var category = ParseCategory(Str(source, "category"), context, warnings);

        if (!isReceipt)
        {
            warnings.Insert(0, "not_a_receipt");
            // A false classification with no readable total is not a receipt at all;
            // return an empty suggestion so the client shows the manual card.
            if (total is null)
                return ReceiptSuggestion.Empty([.. warnings.Distinct()]);
        }
        if (totalWarning is not null) warnings.Add(totalWarning);

        return new ReceiptSuggestion(
            total,
            ParseConfidence(source, root),
            [.. warnings.Distinct()],
            merchant,
            currency,
            date,
            tax,
            tip,
            category);
    }

    private static (DateOnly? Date, string? Warning) ParseDate(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return (null, null);
        var value = raw.Trim();
        DateOnly date;
        var parsed =
            DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out date) ||
            DateOnly.TryParseExact(value, "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out date);
        if (!parsed) return (null, "date_invalid");
        if (date > DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1))) return (null, "date_invalid");
        return (date, null);
    }

    private static decimal? ParseTotal(decimal? raw, out string? warning)
    {
        if (raw is null)
        {
            warning = "total_missing";
            return null;
        }
        warning = null;
        var value = Math.Round(raw.Value, 2, MidpointRounding.AwayFromZero);
        if (ExpenseService.ParseAmount(value).Error is not null)
        {
            warning = "total_invalid";
            return null;
        }
        return value;
    }

    private static decimal? ParseExtra(decimal? raw)
    {
        if (raw is null) return null;
        var value = Math.Round(raw.Value, 2, MidpointRounding.AwayFromZero);
        return ExpenseService.ParseExtra(value, "amount").Error is null ? value : null;
    }

    private static string? ParseCategory(string? raw, OcrContext? context, List<string> warnings)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var key = raw.Trim().ToLowerInvariant();
        if (key.Length is 0 or > MaxCategoryKeyLength) return null;
        var keys = context?.CategoryKeys;
        if (keys is { Count: > 0 } && !keys.Contains(key, StringComparer.OrdinalIgnoreCase))
        {
            warnings.Add("category_unknown");
            return null;
        }
        return key;
    }

    private static ReceiptConfidence ParseConfidence(JsonElement source, JsonElement root)
    {
        foreach (var element in new[] { source, root })
        {
            if (!element.TryGetProperty("confidence", out var confidence)) continue;
            if (confidence.ValueKind == JsonValueKind.Object)
                return new ReceiptConfidence(
                    Level(confidence, "total"),
                    Level(confidence, "date"),
                    Level(confidence, "merchant"),
                    Level(confidence, "category"));
            if (confidence.ValueKind == JsonValueKind.String)
                return new ReceiptConfidence(Level(confidence.GetString()));
        }
        return ReceiptConfidence.None;
    }

    private static string? Level(JsonElement obj, string name)
        => obj.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? Level(value.GetString())
            : null;

    private static string? Level(string? raw)
    {
        var value = raw?.Trim().ToLowerInvariant();
        return value is "high" or "low" ? value : null;
    }

    private static string? CleanText(string? raw, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var text = Regex.Replace(raw, @"\s+", " ").Trim();
        if (text.Length == 0) return null;
        return text.Length <= maxLength ? text : text[..maxLength].TrimEnd();
    }

    private static string? Currency(string? raw)
    {
        var value = raw?.Trim().ToUpperInvariant();
        return value is not null && value.Length == 3 && value.All(char.IsAsciiLetterUpper) ? value : null;
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

    private static bool? Bool(JsonElement obj, string name)
        => obj.TryGetProperty(name, out var p) && p.ValueKind is JsonValueKind.True or JsonValueKind.False
            ? p.GetBoolean()
            : null;

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
