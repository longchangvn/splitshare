using SplitShare.Api.Models;

namespace SplitShare.Api.Expenses;

/// <summary>Per-user split line after a resplit (share includes guests the user covers).</summary>
public sealed record ResplitLine(Guid UserId, long ShareCents, long? ExactCents, decimal? Percent, int? Shares);

public sealed record ResplitResult(List<ResplitLine> Lines, List<Guid> DroppedGuestIds);

/// <summary>
/// Member removal "re-split" (option A): rebuild one expense as if the removed
/// member had never been a participant, following the expense's own split method.
///   Equal   → base re-divided equally among the remaining participants.
///   Shares  → removed member's shares dropped; base re-divided by remaining shares.
///   Percent → remaining percents scaled up to 100.00 (2dp), base re-divided by them.
///   Exact   → remaining exact amounts kept; the removed amount is spread in
///             proportion to them (equally when all are 0).
/// Guests covered by the removed member join the base and are re-split the same way;
/// guests covered by others stay on their coverer. If nobody else participated, the
/// payer bears the whole base. sum(ShareCents) == AmountCents always.
/// The payer must not be the removed member (caller blocks that case).
/// </summary>
public static class MemberResplit
{
    public static ResplitResult Resplit(Expense e, Guid removed)
    {
        if (e.PayerId == removed)
            throw new InvalidOperationException("Cannot re-split an expense paid by the removed member.");

        var keptGuests = e.Guests.Where(g => g.CoveredByUserId != removed).ToList();
        var dropped = e.Guests.Where(g => g.CoveredByUserId == removed).Select(g => g.Id).ToList();
        var guestCover = keptGuests.GroupBy(g => g.CoveredByUserId).ToDictionary(g => g.Key, g => g.Sum(x => x.ShareCents));
        long Cover(Guid id) => guestCover.TryGetValue(id, out var c) ? c : 0;

        var oldBaseTotal = e.AmountCents - e.Guests.Sum(g => g.ShareCents);
        var baseTotal = e.AmountCents - keptGuests.Sum(g => g.ShareCents);
        var remaining = e.Splits.Where(s => s.UserId != removed).OrderBy(s => s.UserId).ToList();
        var soloPayer = remaining.Count == 0;
        if (soloPayer) remaining = [new ExpenseSplit { ExpenseId = e.Id, UserId = e.PayerId }];
        var ids = remaining.Select(s => s.UserId).ToList();
        // Base share before guests (legacy rows may lack per-method metadata).
        var allGuestCover = e.Guests.GroupBy(g => g.CoveredByUserId).ToDictionary(g => g.Key, g => g.Sum(x => x.ShareCents));
        long BaseShare(ExpenseSplit s) => s.ShareCents - (allGuestCover.TryGetValue(s.UserId, out var c) ? c : 0);

        Dictionary<Guid, long> baseMap;
        Dictionary<Guid, long?> exactOut = ids.ToDictionary(id => id, id => remaining.First(s => s.UserId == id).ExactCents);
        Dictionary<Guid, decimal?> percentOut = ids.ToDictionary(id => id, id => remaining.First(s => s.UserId == id).Percent);
        Dictionary<Guid, int?> sharesOut = ids.ToDictionary(id => id, id => remaining.First(s => s.UserId == id).Shares);

        switch (e.SplitType)
        {
            case SplitType.Shares:
            {
                var weights = remaining.Select(s => soloPayer ? 1 : s.Shares ?? 0).ToList();
                if (weights.All(w => w >= 1))
                {
                    var entries = remaining.Select((s, i) => new ShareEntry(s.UserId, weights[i])).ToList();
                    baseMap = SplitService.Shares(baseTotal, entries).Shares!;
                    foreach (var en in entries) sharesOut[en.UserId] = en.Shares;
                }
                else baseMap = SplitService.Allocate(baseTotal, remaining.Select(s => (s.UserId, (decimal)Math.Max(0, BaseShare(s)))).ToList());
                break;
            }
            case SplitType.Percent:
            {
                var old = remaining.Select(s => (s.UserId, soloPayer ? 100m
                    : s.Percent ?? (oldBaseTotal > 0 ? BaseShare(s) * 100m / oldBaseTotal : 0m))).ToList();
                // Renormalise to exactly 100.00 in basis points so the stored percents stay valid input.
                var bps = SplitService.Allocate(10_000, old.Select(o => (o.UserId, Math.Max(0, o.Item2))).ToList());
                var entries = ids.Select(id => new PercentEntry(id, bps[id] / 100m)).ToList();
                baseMap = SplitService.Percent(baseTotal, entries).Shares!;
                foreach (var en in entries) percentOut[en.UserId] = en.Percent;
                break;
            }
            case SplitType.Exact:
            {
                var old = remaining.ToDictionary(s => s.UserId, s => soloPayer ? 0 : s.ExactCents ?? BaseShare(s));
                var pool = baseTotal - old.Values.Sum();
                var extra = SplitService.Allocate(pool, ids.Select(id => (id, (decimal)Math.Max(0, old[id]))).ToList());
                baseMap = ids.ToDictionary(id => id, id => old[id] + extra[id]);
                foreach (var id in ids) exactOut[id] = baseMap[id];
                break;
            }
            default:
                baseMap = SplitService.Equal(baseTotal, ids);
                break;
        }

        var lines = ids.Select(id => new ResplitLine(id, baseMap[id] + Cover(id), exactOut[id], percentOut[id], sharesOut[id])).ToList();
        if (lines.Sum(l => l.ShareCents) != e.AmountCents)
            throw new InvalidOperationException($"Re-split of expense {e.Id} does not sum to its amount.");
        return new(lines, dropped);
    }
}
