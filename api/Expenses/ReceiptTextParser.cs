using System.Globalization;
using System.Text.RegularExpressions;

namespace SplitShare.Api.Expenses;

/// <summary>
/// Reads a receipt from plain OCR text (<c>Ocr:ResponseMode = text</c>, e.g. local Ollama
/// <c>glm-ocr</c>, which transcribes but cannot follow the JSON prompt). Only the labelled
/// grand total, a printed ISO date/currency and a merchant guess are taken; everything is
/// marked low confidence so the client asks the user to check it.
/// </summary>
public static class ReceiptTextParser
{
    private const int MaxMerchantLength = 100;

    // Strongest label wins; the last matching line wins within a strength (totals sit at the bottom).
    private static readonly Regex StrongLabel = new(
        @"GRAND\s*TOTAL|AMOUNT\s*DUE|TOTAL\s*DUE|BALANCE\s*DUE|TOTAL\s*AMOUNT|TỔNG\s*CỘNG|TỔNG\s*THANH\s*TOÁN|TỔNG\s*TIỀN",
        RegexOptions.Compiled);
    private static readonly Regex TotalLabel = new(@"\bTOTAL\b|\bTỔNG\b", RegexOptions.Compiled);
    private static readonly Regex NotTotal = new(
        @"SUB\s*-?\s*TOTAL|TẠM\s*TÍNH|\bCASH\b|\bCHANGE\b|TENDERED|TIỀN\s*THỪA|KHÁCH\s*ĐƯA|TIỀN\s*MẶT",
        RegexOptions.Compiled);
    private static readonly Regex Amount = new(@"\d[\d.,]*", RegexOptions.Compiled);
    private static readonly Regex IsoDate = new(@"\b(\d{4}-\d{2}-\d{2})\b", RegexOptions.Compiled);
    private static readonly Regex Word3 = new(@"\b[A-Z]{3}\b", RegexOptions.Compiled);

    private static readonly HashSet<string> IsoCurrencies = CultureInfo.GetCultures(CultureTypes.SpecificCultures)
        .Select(c => { try { return new RegionInfo(c.Name).ISOCurrencySymbol; } catch (ArgumentException) { return null; } })
        .OfType<string>()
        .ToHashSet(StringComparer.Ordinal);

    public static IReadOnlyList<ReceiptSuggestion> ParseMany(string? modelText)
    {
        var lines = (modelText ?? "")
            .Split('\n')
            .Select(l => l.Replace('|', ' ').Replace("*", "").Replace("#", "").Trim())
            .Where(l => l.Length > 0)
            .ToList();
        if (lines.Count == 0) throw new OcrProviderException("Provider returned no text.");

        var (totalLine, total) = FindTotal(lines);
        if (total is null) return [ReceiptSuggestion.Empty("total_missing")];

        var warnings = new List<string>();
        var value = Math.Round(total.Value, 2, MidpointRounding.AwayFromZero);
        if (ExpenseService.ParseAmount(value).Error is not null)
            return [ReceiptSuggestion.Empty("total_invalid")];

        var merchant = lines.Take(totalLine)
            .FirstOrDefault(l => !l.Any(char.IsDigit) && !l.Contains(':') && !IsCurrencyLine(l));
        if (merchant is { Length: > MaxMerchantLength }) merchant = merchant[..MaxMerchantLength].TrimEnd();
        var date = FindDate(lines);
        var summary = merchant is null ? null : date is null ? merchant : $"{merchant} — {date:yyyy-MM-dd}";

        return
        [
            new ReceiptSuggestion(
                value,
                new ReceiptConfidence(Total: "low", Date: date is null ? null : "low", Merchant: merchant is null ? null : "low"),
                warnings,
                merchant,
                FindCurrency(lines, totalLine),
                date,
                Summary: summary)
        ];
    }

    private static (int Line, decimal? Total) FindTotal(List<string> lines)
    {
        (int Line, decimal? Total) best = (-1, null);
        var bestStrength = 0;
        for (var i = 0; i < lines.Count; i++)
        {
            var upper = lines[i].ToUpperInvariant();
            if (NotTotal.IsMatch(upper)) continue;
            var strength = StrongLabel.IsMatch(upper) ? 2 : TotalLabel.IsMatch(upper) ? 1 : 0;
            if (strength == 0 || strength < bestStrength) continue;
            // The amount is on the label line, or alone on the next line.
            var amount = LastAmount(lines[i]) ?? (i + 1 < lines.Count && !TotalLabel.IsMatch(lines[i + 1].ToUpperInvariant())
                ? LastAmount(lines[i + 1]) : null);
            if (amount is null) continue;
            best = (i, amount);
            bestStrength = strength;
        }
        return best;
    }

    private static decimal? LastAmount(string line)
    {
        var matches = Amount.Matches(line);
        return matches.Count == 0 ? null : ParseNumber(matches[^1].Value);
    }

    /// <summary>"1,234.50", "1.234,50", "120.000" (VND), "19.98" → invariant decimal.</summary>
    public static decimal? ParseNumber(string raw)
    {
        var s = raw.TrimEnd('.', ',');
        if (s.Length == 0) return null;
        int lastDot = s.LastIndexOf('.'), lastComma = s.LastIndexOf(',');
        string normalized;
        if (lastDot >= 0 && lastComma >= 0)
        {
            var dec = lastDot > lastComma ? '.' : ',';
            var group = dec == '.' ? ',' : '.';
            normalized = s.Replace(group.ToString(), "").Replace(dec, '.');
        }
        else if (lastDot >= 0 || lastComma >= 0)
        {
            var sep = lastDot >= 0 ? '.' : ',';
            var count = s.Count(ch => ch == sep);
            var digitsAfter = s.Length - s.LastIndexOf(sep) - 1;
            normalized = count > 1 || digitsAfter == 3
                ? s.Replace(sep.ToString(), "")
                : s.Replace(sep, '.');
        }
        else normalized = s;
        return decimal.TryParse(normalized, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var v)
            ? v : null;
    }

    private static DateOnly? FindDate(List<string> lines)
    {
        foreach (var line in lines)
        {
            var m = IsoDate.Match(line);
            if (m.Success
                && DateOnly.TryParseExact(m.Groups[1].Value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)
                && d <= DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1)))
                return d;
        }
        return null;
    }

    /// <summary>ISO code printed on the total line, or alone on a line ("VND").</summary>
    private static string? FindCurrency(List<string> lines, int totalLine)
    {
        foreach (Match m in Word3.Matches(lines[totalLine].ToUpperInvariant()))
            if (IsoCurrencies.Contains(m.Value)) return m.Value;
        return lines.Select(l => l.ToUpperInvariant()).FirstOrDefault(IsCurrencyLine);
    }

    private static bool IsCurrencyLine(string line)
        => line.Length == 3 && IsoCurrencies.Contains(line.ToUpperInvariant());
}
