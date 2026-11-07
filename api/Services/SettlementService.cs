namespace SplitShare.Api.Services;

public sealed record SettlementTransfer(Guid FromUserId, Guid ToUserId, long AmountCents);

public sealed record SettlementResult(
    List<SettlementTransfer> Transfers,
    List<string> Steps,
    Dictionary<Guid, long> NetsBefore,
    Dictionary<Guid, long> NetsAfter,
    int RawDebts,
    int Saved);

/// <summary>
/// Pure greedy net-balance optimizer (spec §5/settlement).
/// Yields at most n-1 transfers; deterministic via (amount, user_id) ordering.
/// All amounts in integer minor units (cents) — no rounding dust possible.
/// </summary>
public static class SettlementService
{
    public static SettlementResult Compute(
        IDictionary<Guid, long> nets,
        IDictionary<Guid, string> names,
        string currency,
        int rawDebts)
    {
        var (_, debtors, creditors) = Split(nets);

        var transfers = new List<SettlementTransfer>();
        var di = 0; var ci = 0;
        var dRem = debtors.Select(kv => (Id: kv.Key, Owe: -kv.Value)).ToList();
        var cRem = creditors.Select(kv => (Id: kv.Key, Owed: kv.Value)).ToList();

        while (di < dRem.Count && ci < cRem.Count)
        {
            var d = dRem[di];
            var c = cRem[ci];
            var x = Math.Min(d.Owe, c.Owed);
            transfers.Add(new SettlementTransfer(d.Id, c.Id, x));
            dRem[di] = (d.Id, d.Owe - x);
            cRem[ci] = (c.Id, c.Owed - x);
            if (dRem[di].Owe == 0) di++;
            if (cRem[ci].Owed == 0) ci++;
        }

        return Explain(nets, names, currency, rawDebts, transfers);
    }

    /// <summary>
    /// Explanation (steps, nets, saved) for a given transfer list — the optimizer's
    /// output, or a saved plan that payments have adjusted without re-optimizing.
    /// </summary>
    public static SettlementResult Explain(
        IDictionary<Guid, long> nets,
        IDictionary<Guid, string> names,
        string currency,
        int rawDebts,
        IReadOnlyList<SettlementTransfer> transfers)
    {
        var (before, debtors, creditors) = Split(nets);

        var steps = new List<string>();
        foreach (var c in creditors)
            steps.Add($"{Name(names, c.Key)} is owed {Fmt(c.Value, currency)}.");
        foreach (var d in debtors)
            steps.Add($"{Name(names, d.Key)} owes {Fmt(-d.Value, currency)}.");
        foreach (var z in nets.Where(kv => kv.Value == 0).OrderBy(kv => kv.Key))
            steps.Add($"{Name(names, z.Key)} nets to zero — excluded from transfers.");
        for (var i = 0; i < transfers.Count; i++)
            steps.Add($"Match {i + 1}: {Name(names, transfers[i].FromUserId)} pays {Name(names, transfers[i].ToUserId)} {Fmt(transfers[i].AmountCents, currency)}.");

        if (transfers.Count == 0)
            steps.Add("All settled — nets are all zero.");
        else
            steps.Add($"Result: {rawDebts} raw debts → {transfers.Count} transfers (saved {Math.Max(0, rawDebts - transfers.Count)}).");

        return new SettlementResult(
            transfers.ToList(), steps, before,
            before.Keys.ToDictionary(k => k, _ => 0L),
            rawDebts, Math.Max(0, rawDebts - transfers.Count));
    }

    private static (Dictionary<Guid, long> Before, List<KeyValuePair<Guid, long>> Debtors,
        List<KeyValuePair<Guid, long>> Creditors) Split(IDictionary<Guid, long> nets)
    {
        var before = nets.Where(kv => kv.Value != 0).ToDictionary(kv => kv.Key, kv => kv.Value);
        if (before.Values.Sum() != 0)
            throw new InvalidOperationException("Invariant violated: sum(nets) must be 0.");
        var debtors = before.Where(kv => kv.Value < 0)
            .OrderBy(kv => kv.Value).ThenBy(kv => kv.Key).ToList(); // most negative first
        var creditors = before.Where(kv => kv.Value > 0)
            .OrderByDescending(kv => kv.Value).ThenBy(kv => kv.Key).ToList(); // largest first
        return (before, debtors, creditors);
    }

    private static string Name(IDictionary<Guid, string> names, Guid id)
        => names.TryGetValue(id, out var n) ? n : id.ToString("N")[..8];

    public static string Fmt(long cents, string currency)
        => $"{currency} {(cents / 100m):F2}";
}
