using SplitShare.Api.Services;

namespace SplitShare.Tests;

// Task 2.2: spec settlement scenarios. Amounts in cents.
public sealed class SettlementTests
{
    private static readonly Guid A = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid B = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid C = Guid.Parse("33333333-3333-3333-3333-333333333333");

    private static Dictionary<Guid, string> Names(params (Guid id, string n)[] ps)
        => ps.ToDictionary(p => p.id, p => p.n);

    [Fact]
    public void TransitiveDebtCollapses_BowesA_CowesB_Becomes_CpaysA()
    {
        // B owes A $10, C owes B $10  =>  nets A:+1000, B:0, C:-1000
        var nets = new Dictionary<Guid, long> { [A] = 1000, [B] = 0, [C] = -1000 };
        var r = SettlementService.Compute(nets, Names((A, "A"), (B, "B"), (C, "C")), "USD", rawDebts: 2);

        var t = Assert.Single(r.Transfers);
        Assert.Equal(C, t.FromUserId);
        Assert.Equal(A, t.ToUserId);
        Assert.Equal(1000, t.AmountCents);
        Assert.Contains(r.Steps, s => s.Contains("B nets to zero"));
        Assert.Contains(r.Steps, s => s.Contains("2 raw debts") && s.Contains("1 transfer"));
    }

    [Fact]
    public void EmptyPlanWhenAllSettled()
    {
        var nets = new Dictionary<Guid, long> { [A] = 0, [B] = 0 };
        var r = SettlementService.Compute(nets, Names((A, "A"), (B, "B")), "USD", rawDebts: 0);
        Assert.Empty(r.Transfers);
        Assert.Contains(r.Steps, s => s.Contains("All settled"));
    }

    [Fact]
    public void PennyExactness_10split3()
    {
        // Simulates EQUAL $10.00/3: A paid 1000, shares A=334/B=333/C=333.
        var nets = new Dictionary<Guid, long> { [A] = 666, [B] = -333, [C] = -333 };
        var r = SettlementService.Compute(nets, Names((A, "A"), (B, "B"), (C, "C")), "USD", rawDebts: 2);
        Assert.Equal(666, r.Transfers.Sum(t => t.AmountCents));
        Assert.True(r.NetsBefore.Values.Sum() == 0);
    }

    [Fact]
    public void Deterministic_RegardlessOfInputOrder()
    {
        var n1 = new Dictionary<Guid, long> { [A] = 500, [B] = -200, [C] = -300 };
        var n2 = new Dictionary<Guid, long> { [C] = -300, [A] = 500, [B] = -200 };
        var names = Names((A, "A"), (B, "B"), (C, "C"));
        var r1 = SettlementService.Compute(n1, names, "USD", 2);
        var r2 = SettlementService.Compute(n2, names, "USD", 2);
        Assert.Equal(
            r1.Transfers.Select(t => $"{t.FromUserId}:{t.ToUserId}:{t.AmountCents}"),
            r2.Transfers.Select(t => $"{t.FromUserId}:{t.ToUserId}:{t.AmountCents}"));
    }

    [Fact]
    public void TransferCountBoundedByNMinusOne_OnRandomNets()
    {
        var rng = new Random(42);
        for (var trial = 0; trial < 200; trial++)
        {
            var n = rng.Next(2, 9);
            var ids = Enumerable.Range(0, n).Select(_ => Guid.NewGuid()).ToList();
            var vals = Enumerable.Range(0, n - 1).Select(_ => (long)rng.Next(-5000, 5000)).ToList();
            vals.Add(-vals.Sum()); // force sum == 0
            var nets = ids.Zip(vals, (id, v) => (id, v)).ToDictionary(p => p.id, p => p.v);
            var names = nets.Keys.ToDictionary(k => k, k => k.ToString("N")[..8]);
            var r = SettlementService.Compute(nets, names, "USD", rawDebts: n * 2);
            var nonzero = nets.Count(kv => kv.Value != 0);
            Assert.True(r.Transfers.Count <= Math.Max(0, nonzero - 1));
            // conservation: total moved equals total owed
            Assert.Equal(-nets.Where(kv => kv.Value < 0).Sum(kv => kv.Value),
                r.Transfers.Sum(t => t.AmountCents));
        }
    }

    [Fact]
    public void InvariantViolationThrows()
    {
        var nets = new Dictionary<Guid, long> { [A] = 100, [B] = 100 };
        Assert.Throws<InvalidOperationException>(() =>
            SettlementService.Compute(nets, Names((A, "A"), (B, "B")), "USD", 0));
    }
}
