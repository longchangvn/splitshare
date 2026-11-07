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

// Enable/disable an expense (persisted) + group-wide raw (un-optimized) debts.
public sealed class ExpenseExcludedTests
{
    private static (AppDbContext Db, AuthService Auth, ExpenseService Exp, LedgerService Ledger, PaymentService Pay) Setup()
    {
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Jwt:Key"] = new string('k', 64) }).Build();
        var ledger = new LedgerService(db);
        var auth = new AuthService(db, new TokenService(config),
            new StubEmailSender(NullLogger<StubEmailSender>.Instance), ledger);
        return (db, auth, new ExpenseService(db, ledger, new FakeStore(), new CategoryService(db)), ledger,
            new PaymentService(db, ledger));
    }

    private static async Task<(User A, User B, User C, Group G)> SeedAsync(AuthService auth, AppDbContext db)
    {
        async Task<User> U(string n) => (await auth.RegisterAsync(
            "ex" + n + Guid.NewGuid().ToString("N")[..6], $"{n}@x.io", n, "pass1234", null)).User!;
        var a = await U("A"); var b = await U("B"); var c = await U("C");
        var g = new Group { Name = "EX", Currency = "USD", CreatedBy = a.Id };
        db.Groups.Add(g);
        db.GroupMembers.AddRange(
            new GroupMember { GroupId = g.Id, UserId = a.Id, Role = "owner" },
            new GroupMember { GroupId = g.Id, UserId = b.Id },
            new GroupMember { GroupId = g.Id, UserId = c.Id });
        await db.SaveChangesAsync();
        return (a, b, c, g);
    }

    private static Guid Id(ExpenseOp op) => ((ExpenseCreated)op.Data!).Expense.Id;

    [Fact]
    public async Task Disable_RemovesExpenseFromNets_Summary_AndSettlement_EnableRestores()
    {
        var (db, auth, exp, ledger, _) = Setup();
        var (a, b, _, g) = await SeedAsync(auth, db);
        await exp.CreateAsync(a.Id, g.Id, "Hotel", null, 20m, a.Id, SplitType.Equal, [a.Id, b.Id], null, null, null);
        var taxi = Id(await exp.CreateAsync(a.Id, g.Id, "Taxi", null, 10m, a.Id, SplitType.Equal, [a.Id, b.Id], null, null, null));
        Assert.Equal(-1500, (await ledger.ComputeNetsAsync(g.Id))!.Nets[b.Id]);
        var hashBefore = (await ledger.ComputeNetsAsync(g.Id))!.InputsHash;

        var off = await exp.SetExcludedAsync(a.Id, taxi, true);
        Assert.True(off.Ok);
        var snap = (await ledger.ComputeNetsAsync(g.Id))!;
        Assert.Equal(-1000, snap.Nets[b.Id]);
        Assert.NotEqual(hashBefore, snap.InputsHash);
        Assert.True((await db.Expenses.FindAsync(taxi))!.Excluded);
        Assert.Equal(2000, (await ledger.BuildSummaryAsync(g.Id))!.Single(m => m.UserId == a.Id).TotalPaidCents);
        var (plan, _) = await ledger.RecomputeAsync(g.Id);
        Assert.Contains("1000", plan.TransfersJson);

        // Still listed in the ledger, flagged.
        var (items, _) = await ledger.GetLedgerAsync(g.Id, a.Id,
            new("expense", null, null, null, null, null, null, null, "-created_at", 1, 20));
        Assert.True(items.Single(i => i.Id == taxi).Excluded);
        Assert.False(items.Single(i => i.Title == "Hotel").Excluded);

        Assert.True((await exp.SetExcludedAsync(a.Id, taxi, false)).Ok);
        Assert.Equal(-1500, (await ledger.ComputeNetsAsync(g.Id))!.Nets[b.Id]);
        Assert.Equal(2, db.ExpenseAudits.Count(x => x.ExpenseId == taxi && x.DiffJson.Contains("excluded")));
    }

    [Fact]
    public async Task Toggle_RequiresEditRights_AndIsIdempotent()
    {
        var (db, auth, exp, _, _) = Setup();
        var (a, b, _, g) = await SeedAsync(auth, db);
        var id = Id(await exp.CreateAsync(a.Id, g.Id, "Hotel", null, 20m, a.Id, SplitType.Equal, [a.Id, b.Id], null, null, null));

        Assert.Equal("FORBIDDEN", (await exp.SetExcludedAsync(b.Id, id, true)).ErrorCode); // not creator/owner
        Assert.Equal("FORBIDDEN", (await exp.SetExcludedAsync(Guid.NewGuid(), id, true)).ErrorCode); // not a member
        Assert.Equal("NOT_FOUND", (await exp.SetExcludedAsync(a.Id, Guid.NewGuid(), true)).ErrorCode);

        Assert.True((await exp.SetExcludedAsync(a.Id, id, true)).Ok);
        var version = (await db.Expenses.FindAsync(id))!.Version;
        Assert.True((await exp.SetExcludedAsync(a.Id, id, true)).Ok); // no-op
        Assert.Equal(version, (await db.Expenses.FindAsync(id))!.Version);
    }

    [Fact]
    public async Task Enable_Blocked_WhenParticipantLeft()
    {
        var (db, auth, exp, _, _) = Setup();
        var (a, b, _, g) = await SeedAsync(auth, db);
        var id = Id(await exp.CreateAsync(a.Id, g.Id, "Hotel", null, 20m, a.Id, SplitType.Equal, [a.Id, b.Id], null, null, null));
        Assert.True((await exp.SetExcludedAsync(a.Id, id, true)).Ok);
        db.GroupMembers.RemoveRange(db.GroupMembers.Where(m => m.GroupId == g.Id && m.UserId == b.Id));
        await db.SaveChangesAsync();

        Assert.Equal("VALIDATION", (await exp.SetExcludedAsync(a.Id, id, false)).ErrorCode);
    }

    [Fact]
    public async Task SettleUp_LocksEnabledOnly_DisabledStaysOpen()
    {
        var (db, auth, exp, _, pay) = Setup();
        var (a, b, _, g) = await SeedAsync(auth, db);
        await exp.CreateAsync(a.Id, g.Id, "Hotel", null, 20m, a.Id, SplitType.Equal, [a.Id, b.Id], null, null, null);
        var taxi = Id(await exp.CreateAsync(a.Id, g.Id, "Taxi", null, 10m, a.Id, SplitType.Equal, [a.Id, b.Id], null, null, null));
        Assert.True((await exp.SetExcludedAsync(a.Id, taxi, true)).Ok);

        var r = await pay.RecordAsync(b.Id, g.Id, b.Id, a.Id, 10m, "cash", null);
        Assert.True(((PaymentRecorded)r.Data!).FullySettled);
        Assert.Equal(ExpenseStatus.Open, (await db.Expenses.FindAsync(taxi))!.Status);
        Assert.Equal(ExpenseStatus.Locked, db.Expenses.Single(e => e.Title == "Hotel").Status);
    }

    [Fact]
    public async Task RawDebts_AccumulatePerPair_WithoutOptimization()
    {
        var (db, auth, exp, ledger, _) = Setup();
        var (a, b, c, g) = await SeedAsync(auth, db);
        // B owes A 10, C owes B 10 → optimizer: C pays A 10 (one transfer); raw keeps both.
        await exp.CreateAsync(a.Id, g.Id, "AforB", null, 10m, a.Id, SplitType.Exact, [b.Id],
            [new ExactEntry(b.Id, 1000)], null, null);
        await exp.CreateAsync(a.Id, g.Id, "BforC", null, 10m, b.Id, SplitType.Exact, [c.Id],
            [new ExactEntry(c.Id, 1000)], null, null);
        // Reverse direction offsets the pair: A owes B 3 → B owes A 7.
        await exp.CreateAsync(a.Id, g.Id, "BforA", null, 3m, b.Id, SplitType.Exact, [a.Id],
            [new ExactEntry(a.Id, 300)], null, null);

        var snap = (await ledger.ComputeNetsAsync(g.Id))!;
        var raw = LedgerService.RawDebts(snap);
        Assert.Equal(2, raw.Count);
        Assert.Contains(raw, d => d.FromUserId == c.Id && d.ToUserId == b.Id && d.AmountCents == 1000);
        Assert.Contains(raw, d => d.FromUserId == b.Id && d.ToUserId == a.Id && d.AmountCents == 700);
        foreach (var (u, net) in snap.Nets)
            Assert.Equal(net, raw.Where(d => d.ToUserId == u).Sum(d => d.AmountCents)
                - raw.Where(d => d.FromUserId == u).Sum(d => d.AmountCents));

        // A payment shrinks its pair.
        db.Payments.Add(new Payment { GroupId = g.Id, FromUserId = c.Id, ToUserId = b.Id, AmountCents = 400, CreatedBy = c.Id });
        await db.SaveChangesAsync();
        raw = LedgerService.RawDebts((await ledger.ComputeNetsAsync(g.Id))!);
        Assert.Contains(raw, d => d.FromUserId == c.Id && d.ToUserId == b.Id && d.AmountCents == 600);
    }
}
