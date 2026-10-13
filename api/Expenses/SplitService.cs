using SplitShare.Api.Models;

namespace SplitShare.Api.Expenses;

public sealed record ExactEntry(Guid UserId, long AmountCents);
public sealed record PercentEntry(Guid UserId, decimal Percent);
public sealed record ShareEntry(Guid UserId, int Shares);

/// <summary>
/// Deterministic split math (spec §4/expenses). Server is source of truth.
/// Remainder cents go to lowest user_id first; fractional ties break by user_id.
/// All sums are exact: sum(shares) == total always.
/// </summary>
public static class SplitService
{
    public static Dictionary<Guid, long> Equal(long total, List<Guid> participants)
    {
        var ordered = participants.Distinct().OrderBy(id => id).ToList();
        var n = ordered.Count;
        var baseShare = total / n;
        var remainder = (int)(total % n);
        return ordered.Select((id, i) => (id, baseShare + (i < remainder ? 1 : 0)))
            .ToDictionary(p => p.id, p => p.Item2);
    }

    public static (Dictionary<Guid, long>? Shares, string? Error) Exact(long total, List<ExactEntry> entries)
    {
        if (entries.Any(e => e.AmountCents < 0))
            return (null, "Exact amounts must be >= 0.");
        var sum = entries.Sum(e => e.AmountCents);
        if (sum != total)
            return (null, $"Exact shares sum to {sum}, expected {total} (diff {sum - total}).");
        return (entries.ToDictionary(e => e.UserId, e => e.AmountCents), null);
    }

    public static (Dictionary<Guid, long>? Shares, string? Error) Percent(long total, List<PercentEntry> entries)
    {
        if (entries.Any(e => e.Percent < 0))
            return (null, "Percents must be >= 0.");
        if (entries.Sum(e => e.Percent) != 100.00m)
            return (null, $"Percents sum to {entries.Sum(e => e.Percent)}, expected 100.00.");
        var weights = entries.Select(e => (e.UserId, (decimal)e.Percent)).ToList();
        return (LargestRemainder(total, weights), null);
    }

    public static (Dictionary<Guid, long>? Shares, string? Error) Shares(long total, List<ShareEntry> entries)
    {
        if (entries.Any(e => e.Shares <= 0))
            return (null, "Shares must be >= 1.");
        var weights = entries.Select(e => (e.UserId, (decimal)e.Shares)).ToList();
        return (LargestRemainder(total, weights), null);
    }

    private static Dictionary<Guid, long> LargestRemainder(long total, List<(Guid UserId, decimal Weight)> weights)
    {
        var sum = weights.Sum(w => w.Weight);
        var floors = weights.Select(w =>
        {
            var exact = total * w.Weight / sum;
            return (w.UserId, Floor: (long)Math.Floor(exact), Frac: exact - Math.Floor(exact));
        }).ToList();
        var leftover = (int)(total - floors.Sum(f => f.Floor));
        var bonus = floors.OrderByDescending(f => f.Frac).ThenBy(f => f.UserId)
            .Take(leftover).Select(f => f.UserId).ToHashSet();
        return floors.ToDictionary(f => f.UserId, f => f.Floor + (bonus.Contains(f.UserId) ? 1 : 0));
    }
}
