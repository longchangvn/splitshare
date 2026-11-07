using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using SplitShare.Api.Auth;
using SplitShare.Api.Data;
using SplitShare.Api.Expenses;
using SplitShare.Api.Groups;
using SplitShare.Api.Models;
using SplitShare.Api.Payments;
using SplitShare.Api.Services;

namespace SplitShare.Tests;

// The optimizer runs on expense changes only; payments that fit the plan adjust it in place.
public sealed class SettlementStabilityTests
{
    private sealed record Kit(AppDbContext Db, LedgerService Ledger, ExpenseService Exp, PaymentService Pay,
        Group G, User A, User B, User C, User D);

    // C paid 60 for A; D paid 40 for A,B. Nets: A -80, B -20, C +60, D +40.
    // Optimizer plan: A→C 60, A→D 20, B→D 20.
    private static async Task<Kit> SetupAsync()
    {
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Jwt:Key"] = new string('k', 64) }).Build();
        var ledger = new LedgerService(db);
        var auth = new AuthService(db, new TokenService(config),
            new StubEmailSender(NullLogger<StubEmailSender>.Instance), ledger);
        var exp = new ExpenseService(db, ledger, new FakeStore(), new CategoryService(db));
        var users = new List<User>();
        foreach (var n in new[] { "A", "B", "C", "D" })
            users.Add((await auth.RegisterAsync("st" + n.ToLower(), $"st{n.ToLower()}@x.io", n, "pass1234", null)).User!);
        var g = new Group { Name = "ST", Currency = "USD", CreatedBy = users[0].Id };
        db.Groups.Add(g);
        db.GroupMembers.AddRange(users.Select((u, i) =>
            new GroupMember { GroupId = g.Id, UserId = u.Id, Role = i == 0 ? "owner" : "member" }));
        await db.SaveChangesAsync();
        var (a, b, c, d) = (users[0], users[1], users[2], users[3]);
        Assert.True((await exp.CreateAsync(c.Id, g.Id, "Hotel", null, 60m, c.Id,
            SplitType.Equal, [a.Id], null, null, null)).Ok);
        Assert.True((await exp.CreateAsync(d.Id, g.Id, "Dinner", null, 40m, d.Id,
            SplitType.Equal, [a.Id, b.Id], null, null, null)).Ok);
        return new Kit(db, ledger, exp, new PaymentService(db, ledger), g, a, b, c, d);
    }

    private static async Task<HashSet<(Guid, Guid, long)>> PlanAsync(Kit k)
    {
        var snapshot = (await k.Ledger.ComputeNetsAsync(k.G.Id))!;
        return (await k.Ledger.CurrentTransfersAsync(k.G.Id, snapshot))
            .Select(t => (t.FromUserId, t.ToUserId, t.AmountCents)).ToHashSet();
    }

    private static async Task<HashSet<(Guid, Guid, long)>> OptimizedAsync(Kit k)
    {
        var s = (await k.Ledger.ComputeNetsAsync(k.G.Id))!;
        return SettlementService.Compute(s.Nets, s.Names, s.Currency, s.RawDebts).Transfers
            .Select(t => (t.FromUserId, t.ToUserId, t.AmountCents)).ToHashSet();
    }

    [Fact]
    public async Task ExpenseCreate_Optimizes()
    {
        var k = await SetupAsync();
        Assert.Equal([(k.A.Id, k.C.Id, 6000L), (k.A.Id, k.D.Id, 2000L), (k.B.Id, k.D.Id, 2000L)],
            await PlanAsync(k));
    }

    [Fact]
    public async Task PartialOnPlanPayment_ShrinksThatTransfer_NoReshuffle()
    {
        var k = await SetupAsync();
        var rec = await k.Pay.RecordAsync(k.A.Id, k.G.Id, k.A.Id, k.C.Id, 30m, "cash", null);
        Assert.True(rec.Ok);

        var expected = new HashSet<(Guid, Guid, long)>
            { (k.A.Id, k.C.Id, 3000L), (k.A.Id, k.D.Id, 2000L), (k.B.Id, k.D.Id, 2000L) };
        Assert.Equal(expected, await PlanAsync(k));
        // Re-optimizing would have reshuffled (A→D 40, A→C 10, B→C 20).
        Assert.NotEqual(expected, await OptimizedAsync(k));

        // Persisted plan, GET /settlement path and dashboard all show the same stable plan.
        var (plan, _) = await k.Ledger.RecomputeAsync(k.G.Id);
        Assert.Equal(((PaymentRecorded)rec.Data!).SettlementVersion, plan.VersionSeq);
        var mine = (await k.Ledger.BuildAllAsync(k.B.Id)).Groups.Single().MyTransfers;
        Assert.Equal(k.D.Id, Assert.Single(mine).ToUserId);
        var me = (await k.Ledger.BuildMeAsync(k.G.Id, k.A.Id))!;
        Assert.Equal(3000L, me.Owes.Single(o => o.ToUserId == k.C.Id).AmountCents);
    }

    [Fact]
    public async Task FullOnPlanPayment_RemovesOnlyThatTransfer()
    {
        var k = await SetupAsync();
        Assert.True((await k.Pay.RecordAsync(k.B.Id, k.G.Id, k.B.Id, k.D.Id, 20m, "cash", null)).Ok);
        Assert.Equal([(k.A.Id, k.C.Id, 6000L), (k.A.Id, k.D.Id, 2000L)], await PlanAsync(k));
    }

    [Fact]
    public async Task Reversal_RestoresTransfer_NoReshuffle()
    {
        var k = await SetupAsync();
        var rec = (PaymentRecorded)(await k.Pay.RecordAsync(k.A.Id, k.G.Id, k.A.Id, k.C.Id, 30m, "cash", null)).Data!;
        Assert.True((await k.Pay.ReverseAsync(k.A.Id, rec.Payment.Id)).Ok);
        Assert.Equal([(k.A.Id, k.C.Id, 6000L), (k.A.Id, k.D.Id, 2000L), (k.B.Id, k.D.Id, 2000L)],
            await PlanAsync(k));

        // A fully-cleared transfer is re-added on reversal.
        var full = (PaymentRecorded)(await k.Pay.RecordAsync(k.B.Id, k.G.Id, k.B.Id, k.D.Id, 20m, "cash", null)).Data!;
        Assert.True((await k.Pay.ReverseAsync(k.A.Id, full.Payment.Id)).Ok);
        Assert.Equal([(k.A.Id, k.C.Id, 6000L), (k.A.Id, k.D.Id, 2000L), (k.B.Id, k.D.Id, 2000L)],
            await PlanAsync(k));
    }

    [Fact]
    public async Task OffPlanPayee_Reoptimizes()
    {
        var k = await SetupAsync();
        Assert.True((await k.Pay.RecordAsync(k.A.Id, k.G.Id, k.A.Id, k.B.Id, 10m, "cash", null)).Ok);
        Assert.Equal(await OptimizedAsync(k), await PlanAsync(k));
    }

    [Fact]
    public async Task PayingMoreThanTransfer_Reoptimizes()
    {
        var k = await SetupAsync();
        Assert.True((await k.Pay.RecordAsync(k.A.Id, k.G.Id, k.A.Id, k.D.Id, 30m, "cash", null)).Ok);
        Assert.Equal(await OptimizedAsync(k), await PlanAsync(k));
    }

    [Fact]
    public async Task ExpenseAfterPayment_Reoptimizes()
    {
        var k = await SetupAsync();
        Assert.True((await k.Pay.RecordAsync(k.A.Id, k.G.Id, k.A.Id, k.C.Id, 30m, "cash", null)).Ok);
        Assert.NotEqual(await OptimizedAsync(k), await PlanAsync(k));
        Assert.True((await k.Exp.CreateAsync(k.B.Id, k.G.Id, "Taxi", null, 10m, k.B.Id,
            SplitType.Equal, [k.A.Id], null, null, null)).Ok);
        Assert.Equal(await OptimizedAsync(k), await PlanAsync(k));
    }
}
