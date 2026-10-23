using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using SplitShare.Api.Auth;
using SplitShare.Api.Data;
using SplitShare.Api.Expenses;
using SplitShare.Api.Groups;
using SplitShare.Api.Models;
using SplitShare.Api.Services;

namespace SplitShare.Tests;

public sealed class LedgerViewTests
{
    private static (AppDbContext Db, AuthService Auth, ExpenseService Exp, LedgerService Ledger) Setup()
    {
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Jwt:Key"] = new string('k', 64) }).Build();
        var ledger = new LedgerService(db);
        var auth = new AuthService(db, new TokenService(config),
            new StubEmailSender(NullLogger<StubEmailSender>.Instance), ledger);
        return (db, auth, new ExpenseService(db, ledger, new FakeStore(), new CategoryService(db)), ledger);
    }

    private static async Task<(User A, User B, Group G)> SeedAsync(AuthService auth, AppDbContext db, string cur = "USD")
    {
        var a = (await auth.RegisterAsync("lda" + Guid.NewGuid().ToString("N")[..6], "a@x.io", "A", "pass1234", null)).User!;
        var b = (await auth.RegisterAsync("ldb" + Guid.NewGuid().ToString("N")[..6], "b@x.io", "B", "pass1234", null)).User!;
        var g = new Group { Name = "LG", Currency = cur, CreatedBy = a.Id };
        db.Groups.Add(g);
        db.GroupMembers.AddRange(
            new GroupMember { GroupId = g.Id, UserId = a.Id, Role = "owner" },
            new GroupMember { GroupId = g.Id, UserId = b.Id });
        await db.SaveChangesAsync();
        return (a, b, g);
    }

    private static LedgerService.LedgerFilters All(int page = 1, int limit = 20)
        => new("all", null, null, null, null, null, null, null, "-created_at", page, limit);

    [Fact]
    public async Task Summary_PerMember_Paid_Share_Net_Owe()
    {
        var (db, auth, exp, ledger) = Setup();
        var (a, b, g) = await SeedAsync(auth, db);
        await exp.CreateAsync(a.Id, g.Id, "Hotel", null, 20m, a.Id, SplitType.Equal, [a.Id, b.Id], null, null, null);
        await exp.CreateAsync(a.Id, g.Id, "Taxi", null, 10m, b.Id, SplitType.Equal, [a.Id, b.Id], null, null, null);
        db.Payments.Add(new Payment
            { GroupId = g.Id, FromUserId = b.Id, ToUserId = a.Id, AmountCents = 300, CreatedBy = b.Id });
        await db.SaveChangesAsync();

        var summary = (await ledger.BuildSummaryAsync(g.Id))!;
        Assert.Equal(2, summary.Count);
        var ra = summary.Single(m => m.UserId == a.Id);
        Assert.Equal(2000, ra.TotalPaidCents);
        Assert.Equal(1500, ra.TotalShareCents);
        Assert.Equal(200, ra.NetCents);
        Assert.Equal(0, ra.OweCents);
        var rb = summary.Single(m => m.UserId == b.Id);
        Assert.Equal(1000, rb.TotalPaidCents);
        Assert.Equal(1500, rb.TotalShareCents);
        Assert.Equal(-200, rb.NetCents);
        Assert.Equal(200, rb.OweCents);
        Assert.Null(await ledger.BuildSummaryAsync(Guid.NewGuid()));
    }

    [Fact]
    public async Task Ledger_Filters_Type_Status_Search_Pagination()
    {
        var (db, auth, exp, ledger) = Setup();
        var (a, b, g) = await SeedAsync(auth, db);
        await exp.CreateAsync(a.Id, g.Id, "Hotel", null, 20m, a.Id, SplitType.Equal, [a.Id, b.Id], null, null, null);
        await exp.CreateAsync(a.Id, g.Id, "Taxi", null, 10m, b.Id, SplitType.Equal, [a.Id, b.Id], null, null, null);
        db.Payments.Add(new Payment
            { GroupId = g.Id, FromUserId = b.Id, ToUserId = a.Id, AmountCents = 500, CreatedBy = b.Id });
        await db.SaveChangesAsync();

        var (all, total) = await ledger.GetLedgerAsync(g.Id, a.Id, All());
        Assert.Equal(3, total);
        var (expOnly, expTotal) = await ledger.GetLedgerAsync(g.Id, a.Id, All() with { Type = "expense" });
        Assert.Equal(2, expTotal);
        var (payOnly, payTotal) = await ledger.GetLedgerAsync(g.Id, a.Id, All() with { Type = "payment" });
        Assert.Equal(1, payTotal);
        var (found, foundTotal) = await ledger.GetLedgerAsync(g.Id, a.Id, All() with { Q = "tax" });
        Assert.Equal(1, foundTotal);
        var (p1, _) = await ledger.GetLedgerAsync(g.Id, a.Id, All(1, 2));
        var (p2, _) = await ledger.GetLedgerAsync(g.Id, a.Id, All(2, 2));
        Assert.Equal(2, p1.Count);
        Assert.Single(p2);
        Assert.Throws<InvalidOperationException>(() =>
            ledger.GetLedgerAsync(g.Id, Guid.NewGuid(), All()).GetAwaiter().GetResult());
    }

    [Fact]
    public async Task Ledger_RemovedMember_SnapshotRule()
    {
        var (db, auth, exp, ledger) = Setup();
        var (a, b, g) = await SeedAsync(auth, db);
        await exp.CreateAsync(a.Id, g.Id, "Before", null, 20m, a.Id,
            SplitType.Equal, [a.Id, b.Id], null, null, null);
        foreach (var e in db.Expenses) e.CreatedAt = DateTime.UtcNow.AddHours(-2);
        // B settles, leaves an hour ago, then A adds another expense.
        var pay = new Payment
            { GroupId = g.Id, FromUserId = b.Id, ToUserId = a.Id, AmountCents = 1000, CreatedBy = b.Id };
        pay.CreatedAt = DateTime.UtcNow.AddHours(-2);
        db.Payments.Add(pay);
        await db.SaveChangesAsync();
        db.GroupMembers.RemoveRange(db.GroupMembers.Where(m => m.GroupId == g.Id && m.UserId == b.Id));
        db.MembershipArchives.Add(new MembershipArchive
            { GroupId = g.Id, UserId = b.Id, RemovedAt = DateTime.UtcNow.AddHours(-1) });
        await exp.CreateAsync(a.Id, g.Id, "After", null, 50m, a.Id,
            SplitType.Equal, [a.Id], null, null, null);

        var (items, total) = await ledger.GetLedgerAsync(g.Id, b.Id, All());
        var titles = items.Select(i => i.Title).ToList();
        Assert.DoesNotContain("After", titles); // created after removal: hidden
        Assert.Contains("Before", titles);
        Assert.Contains(items, i => i.Kind == "payment"); // own payment visible
    }

    [Fact]
    public async Task Me_OwesBreakdown_And_All_PerCurrency()
    {
        var (db, auth, exp, ledger) = Setup();
        var (a, b, g) = await SeedAsync(auth, db, "USD");
        await exp.CreateAsync(a.Id, g.Id, "D", null, 30m, a.Id,
            SplitType.Equal, [a.Id, b.Id], null, null, null);
        // B owes A 1500.
        var me = (await ledger.BuildMeAsync(g.Id, b.Id))!;
        Assert.Equal(-1500L, me.NetCents);
        Assert.Equal(1500L, Assert.Single(me.Owes).AmountCents);
        var meA = (await ledger.BuildMeAsync(g.Id, a.Id))!;
        Assert.Equal(1500L, meA.NetCents);

        // Second group in EUR where B is creditor.
        var g2 = new Group { Name = "EU", Currency = "EUR", CreatedBy = b.Id };
        db.Groups.Add(g2);
        db.GroupMembers.AddRange(
            new GroupMember { GroupId = g2.Id, UserId = a.Id },
            new GroupMember { GroupId = g2.Id, UserId = b.Id, Role = "owner" });
        await db.SaveChangesAsync();
        await exp.CreateAsync(b.Id, g2.Id, "E", null, 20m, b.Id,
            SplitType.Equal, [a.Id, b.Id], null, null, null);

        var all = await ledger.BuildAllAsync(b.Id);
        Assert.Equal(2, all.Groups.Count);
        Assert.True(all.Totals.ContainsKey("USD") && all.Totals.ContainsKey("EUR")); // never merged
        Assert.Equal(1500L, all.Totals["USD"].OweCents);
        Assert.Equal(0L, all.Totals["USD"].OwedCents);
    }

    [Fact]
    public async Task All_RawDebtBreakdown_PayerBased_AndPaymentAdjusted()
    {
        var (db, auth, exp, ledger) = Setup();
        var (a, b, g) = await SeedAsync(auth, db);
        await exp.CreateAsync(a.Id, g.Id, "D", null, 30m, a.Id,
            SplitType.Equal, [a.Id, b.Id], null, null, null);
        // Raw debt: B owes A 1500 (B's share of A's expense).
        var owesB = (await ledger.BuildAllAsync(b.Id)).Groups.Single().Owes;
        var row = Assert.Single(owesB);
        Assert.Equal(a.Id, row.ToUserId);
        Assert.Equal(a.DisplayName, row.ToName);
        Assert.Equal(1500L, row.AmountCents);
        // A is owed 1500 by B.
        var owedA = (await ledger.BuildAllAsync(a.Id)).Groups.Single().OwedToMe;
        var rowA = Assert.Single(owedA);
        Assert.Equal(b.Id, rowA.FromUserId);
        Assert.Equal(1500L, rowA.AmountCents);

        // B pays A 500 -> the raw pair debt shrinks to 1000 (payment-adjusted).
        db.Payments.Add(new Payment
        { GroupId = g.Id, FromUserId = b.Id, ToUserId = a.Id, AmountCents = 500, CreatedBy = b.Id });
        await db.SaveChangesAsync();

        var afterB = (await ledger.BuildAllAsync(b.Id)).Groups.Single().Owes;
        Assert.Equal(1000L, Assert.Single(afterB).AmountCents);
        var afterA = (await ledger.BuildAllAsync(a.Id)).Groups.Single().OwedToMe;
        Assert.Equal(1000L, Assert.Single(afterA).AmountCents);
    }

    [Fact]
    public async Task All_RawDebtBreakdown_NetsBothDirectionsPerCounterparty()
    {
        var (db, auth, exp, ledger) = Setup();
        var (a, b, g) = await SeedAsync(auth, db);
        // A pays 30m split A/B -> B owes A 1500.
        await exp.CreateAsync(a.Id, g.Id, "D", null, 30m, a.Id,
            SplitType.Equal, [a.Id, b.Id], null, null, null);
        // B pays 10m split A/B in the same group -> A owes B 500.
        await exp.CreateAsync(b.Id, g.Id, "E", null, 10m, b.Id,
            SplitType.Equal, [a.Id, b.Id], null, null, null);

        // Per-pair netting: B owes A 1500 - 500 = 1000, one row, no mirror row.
        var forB = (await ledger.BuildAllAsync(b.Id)).Groups.Single();
        Assert.Equal(1000L, Assert.Single(forB.Owes).AmountCents);
        Assert.Empty(forB.OwedToMe);
        var forA = (await ledger.BuildAllAsync(a.Id)).Groups.Single();
        Assert.Equal(1000L, Assert.Single(forA.OwedToMe).AmountCents);
        Assert.Empty(forA.Owes);
    }

    [Fact]
    public async Task All_RawDebtBreakdown_EmptyListsWhenNoDebts()
    {
        var (db, auth, exp, ledger) = Setup();
        var (a, b, g) = await SeedAsync(auth, db);
        await exp.CreateAsync(a.Id, g.Id, "D", null, 30m, a.Id,
            SplitType.Equal, [a.Id, b.Id], null, null, null);
        db.Payments.Add(new Payment
        { GroupId = g.Id, FromUserId = b.Id, ToUserId = a.Id, AmountCents = 1500, CreatedBy = b.Id });
        await db.SaveChangesAsync();

        var all = await ledger.BuildAllAsync(b.Id);
        var row = all.Groups.Single();
        Assert.NotNull(row.Owes);      // never null: additive, contract-safe
        Assert.NotNull(row.OwedToMe);
        Assert.NotNull(row.MyTransfers); // settled -> no transfers, but never null
        Assert.Empty(row.Owes);
        Assert.Empty(row.OwedToMe);
        Assert.Empty(row.MyTransfers);
        Assert.Equal(0L, all.Totals["USD"].OweCents); // totals untouched by the breakdown
    }

    [Fact]
    public async Task All_Balance_NetsPerCurrency_NeverAcrossAndPrimaryIsLargest()
    {
        var (db, auth, exp, ledger) = Setup();
        var (a, b, g) = await SeedAsync(auth, db, "USD");
        // USD: A pays 30 split A/B -> B is owed-less by 1500, A +1500.
        await exp.CreateAsync(a.Id, g.Id, "D", null, 30m, a.Id,
            SplitType.Equal, [a.Id, b.Id], null, null, null);
        // EUR: B pays 20 split A/B -> B +1000, A -1000.
        var g2 = new Group { Name = "EU", Currency = "EUR", CreatedBy = b.Id };
        db.Groups.Add(g2);
        db.GroupMembers.AddRange(
            new GroupMember { GroupId = g2.Id, UserId = a.Id },
            new GroupMember { GroupId = g2.Id, UserId = b.Id, Role = "owner" });
        await db.SaveChangesAsync();
        await exp.CreateAsync(b.Id, g2.Id, "E", null, 20m, b.Id,
            SplitType.Equal, [a.Id, b.Id], null, null, null);

        // For B: USD -1500, EUR +1000 -> netted per currency, never summed.
        var all = await ledger.BuildAllAsync(b.Id);
        var balance = all.Balance;
        Assert.Equal(2, balance.CurrencyCount);
        Assert.Equal(2, balance.GroupCount);
        Assert.Equal("USD", balance.PrimaryCurrency);   // largest |net| wins
        Assert.Equal(-1500L, balance.PrimaryNetCents);
        Assert.Equal("owe", balance.Direction);
        var usd = balance.ByCurrency.Single(r => r.Currency == "USD");
        var eur = balance.ByCurrency.Single(r => r.Currency == "EUR");
        Assert.Equal(-1500L, usd.NetCents);
        Assert.Equal(1000L, eur.NetCents); // no cross-currency summation
        Assert.Equal(1, usd.GroupCount);
        Assert.Equal(1, eur.GroupCount);
        // Largest |net| first: USD before EUR.
        Assert.Equal("USD", balance.ByCurrency[0].Currency);

        // For A: USD +1500, EUR -1000 -> primary USD, direction owed.
        var forA = (await ledger.BuildAllAsync(a.Id)).Balance;
        Assert.Equal("USD", forA.PrimaryCurrency);
        Assert.Equal(1500L, forA.PrimaryNetCents);
        Assert.Equal("owed", forA.Direction);
    }

    [Fact]
    public async Task All_Balance_SettledWhenNetsAreZero()
    {
        var (db, auth, exp, ledger) = Setup();
        var (a, b, g) = await SeedAsync(auth, db, "USD");
        await exp.CreateAsync(a.Id, g.Id, "D", null, 30m, a.Id,
            SplitType.Equal, [a.Id, b.Id], null, null, null);
        db.Payments.Add(new Payment
        { GroupId = g.Id, FromUserId = b.Id, ToUserId = a.Id, AmountCents = 1500, CreatedBy = b.Id });
        await db.SaveChangesAsync();

        var all = await ledger.BuildAllAsync(b.Id);
        Assert.Equal(0L, all.Balance.PrimaryNetCents);
        Assert.Equal("settled", all.Balance.Direction);
        Assert.Equal("USD", all.Balance.PrimaryCurrency);
        var usd = all.Balance.ByCurrency.Single();
        Assert.Equal("USD", usd.Currency);
        Assert.Equal(0L, usd.NetCents);
        Assert.Equal(1, usd.GroupCount);
    }

    [Fact]
    public async Task All_MyTransfers_AreTheOptimizerPlan_OnlyMine()
    {
        var (db, auth, exp, ledger) = Setup();
        var (a, b, _) = await SeedAsync(auth, db, "USD");
        var c = (await auth.RegisterAsync("ldc" + Guid.NewGuid().ToString("N")[..6], "c@x.io", "C",
            "pass1234", null)).User!;
        var g = new Group { Name = "TRI", Currency = "USD", CreatedBy = a.Id };
        db.Groups.Add(g);
        db.GroupMembers.AddRange(
            new GroupMember { GroupId = g.Id, UserId = a.Id, Role = "owner" },
            new GroupMember { GroupId = g.Id, UserId = b.Id },
            new GroupMember { GroupId = g.Id, UserId = c.Id });
        await db.SaveChangesAsync();

        // A pays 30 split A/B -> B owes A 1500. B pays 30 split B/C -> C owes B 1500.
        // Nets: A +1500, B 0, C -1500 -> optimizer collapses 2 raw debts into
        // ONE transfer C -> A 1500 (B nets to zero and drops out of transfers).
        await exp.CreateAsync(a.Id, g.Id, "D", null, 30m, a.Id,
            SplitType.Equal, [a.Id, b.Id], null, null, null);
        await exp.CreateAsync(b.Id, g.Id, "E", null, 30m, b.Id,
            SplitType.Equal, [b.Id, c.Id], null, null, null);

        // A and B are also in the seeded (expense-free) group; scope to TRI.
        var forA = (await ledger.BuildAllAsync(a.Id)).Groups.Single(x => x.Name == "TRI");
        var xferA = Assert.Single(forA.MyTransfers);
        Assert.Equal(c.Id, xferA.FromUserId);
        Assert.Equal(c.DisplayName, xferA.FromName);
        Assert.Equal(a.Id, xferA.ToUserId);
        Assert.Equal(a.DisplayName, xferA.ToName);
        Assert.Equal(1500L, xferA.AmountCents);
        Assert.False(xferA.FromMe); // A receives, so this is not A's own payment

        var forC = (await ledger.BuildAllAsync(c.Id)).Groups.Single(x => x.Name == "TRI");
        var xferC = Assert.Single(forC.MyTransfers);
        Assert.True(xferC.FromMe);
        Assert.Equal(1500L, xferC.AmountCents);

        // B nets to zero -> no optimized transfer, yet the raw pairwise debts
        // still name B (raw view and optimizer view stay distinct).
        var allB = await ledger.BuildAllAsync(b.Id);
        var forB = allB.Groups.Single(x => x.Name == "TRI");
        Assert.Empty(forB.MyTransfers);
        Assert.NotEmpty(forB.Owes);
        Assert.Equal(0L, allB.Balance.PrimaryNetCents); // B's total balance is settled
    }
}
