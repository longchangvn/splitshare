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

public sealed class TripPackTests
{
    private static (AppDbContext Db, AuthService Auth, ExpenseService Exp, GroupService Groups,
        PaymentService Pay, LedgerService Ledger, RecurringService Recur) Setup()
    {
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Jwt:Key"] = new string('k', 64) }).Build();
        var ledger = new LedgerService(db);
        var mail = new StubEmailSender(NullLogger<StubEmailSender>.Instance);
        var auth = new AuthService(db, new TokenService(config), mail, ledger);
        var groups = new GroupService(db, ledger, mail, config);
        var exp = new ExpenseService(db, ledger, new FakeStore(), mail);
        return (db, auth, exp, groups, new PaymentService(db, ledger), ledger, new RecurringService(db, exp));
    }

    private static async Task<(User A, User B, Group G)> SeedGroup(AuthService auth, AppDbContext db)
    {
        var a = (await auth.RegisterAsync("tpa", "tpa@x.io", "A", "pass1234", null)).User!;
        var b = (await auth.RegisterAsync("tpb", "tpb@x.io", "B", "pass1234", null)).User!;
        var g = new Group { Name = "TPG", CreatedBy = a.Id };
        db.Groups.Add(g);
        db.GroupMembers.AddRange(
            new GroupMember { GroupId = g.Id, UserId = a.Id, Role = "owner" },
            new GroupMember { GroupId = g.Id, UserId = b.Id });
        await db.SaveChangesAsync();
        return (a, b, g);
    }

    [Fact]
    public async Task Extras_Fold_Into_Split()
    {
        var (db, auth, exp, _, _, _, _) = Setup();
        var (a, b, g) = await SeedGroup(auth, db);
        var r = await exp.CreateAsync(a.Id, g.Id, "Dinner", null, 100m, a.Id, SplitType.Equal,
            [a.Id, b.Id], null, null, null,
            new ExpenseOptions(Tax: 7m, Tip: 10m, Category: "food"));
        Assert.True(r.Ok);
        var e = ((ExpenseCreated)r.Data!).Expense;
        Assert.Equal(11700, e.AmountCents);
        Assert.Equal(5850, e.Splits.First(s => s.UserId == a.Id).ShareCents);
        Assert.Equal("food", e.Category);
    }

    [Fact]
    public async Task Guests_Ride_On_Covering_Member()
    {
        var (db, auth, exp, _, _, ledger, _) = Setup();
        var (a, b, g) = await SeedGroup(auth, db);
        var r = await exp.CreateAsync(a.Id, g.Id, "Lunch", null, 100m, a.Id, SplitType.Equal,
            [a.Id, b.Id], null, null, null,
            new ExpenseOptions(Guests: [new GuestEntry("Kid", 2000, a.Id)]));
        Assert.True(r.Ok);
        var e = ((ExpenseCreated)r.Data!).Expense;
        Assert.Equal(12000, e.AmountCents);
        Assert.Equal(7000, e.Splits.First(s => s.UserId == a.Id).ShareCents);
        Assert.Equal(5000, e.Splits.First(s => s.UserId == b.Id).ShareCents);
        var nets = (await ledger.ComputeNetsAsync(g.Id))!.Nets;
        Assert.Equal(0, nets.Values.Sum()); // invariant holds
    }

    [Fact]
    public async Task Fx_Triple_Converts()
    {
        var (db, auth, exp, _, _, _, _) = Setup();
        var (a, b, g) = await SeedGroup(auth, db);
        var r = await exp.CreateAsync(a.Id, g.Id, "Sushi", null, 999m, a.Id, SplitType.Equal,
            [a.Id], null, null, null,
            new ExpenseOptions(OrigCurrency: "JPY", OrigAmount: 10000m, FxRate: 0.0066m));
        Assert.True(r.Ok);
        var e = ((ExpenseCreated)r.Data!).Expense;
        Assert.Equal(6600, e.AmountCents);
        Assert.Equal("JPY", e.OrigCurrency);
        var bad = await exp.CreateAsync(a.Id, g.Id, "X", null, 10m, a.Id, SplitType.Equal,
            [a.Id], null, null, null, new ExpenseOptions(OrigCurrency: "USD"));
        Assert.Equal("VALIDATION", bad.ErrorCode); // partial triple rejected
    }

    [Fact]
    public async Task OnlyPresent_Drops_Late_Joiner()
    {
        var (db, auth, exp, _, _, _, _) = Setup();
        var (a, b, g) = await SeedGroup(auth, db);
        db.GroupMembers.First(m => m.GroupId == g.Id && m.UserId == b.Id).JoinedAt =
            DateTime.UtcNow.AddDays(3); // b joins in the future
        await db.SaveChangesAsync();
        var r = await exp.CreateAsync(a.Id, g.Id, "Day1", null, 100m, a.Id, SplitType.Equal,
            [a.Id, b.Id], null, null, null,
            new ExpenseOptions(SpentAt: DateTime.UtcNow, OnlyPresent: true));
        Assert.True(r.Ok);
        var e = ((ExpenseCreated)r.Data!).Expense;
        Assert.Single(e.Splits);
        Assert.Equal(10000, e.Splits[0].ShareCents);
    }

    [Fact]
    public async Task Treasurer_Can_Record_But_Not_Remove()
    {
        var (db, auth, exp, groups, pay, _, _) = Setup();
        var (a, b, g) = await SeedGroup(auth, db);
        var c = (await auth.RegisterAsync("tpc", "tpc@x.io", "C", "pass1234", null)).User!;
        db.GroupMembers.Add(new GroupMember { GroupId = g.Id, UserId = c.Id });
        await db.SaveChangesAsync();
        await exp.CreateAsync(a.Id, g.Id, "D", null, 30m, a.Id, SplitType.Equal,
            [a.Id, b.Id], null, null, null);
        Assert.True((await groups.SetRoleAsync(a.Id, g.Id, c.Id, "treasurer")).Ok);
        var rec = await pay.RecordAsync(c.Id, g.Id, b.Id, a.Id, 15m, "transfer", null);
        Assert.True(rec.Ok);
        Assert.False((await groups.RemoveMemberAsync(c.Id, g.Id, b.Id)).Ok); // treasurer cannot remove
    }

    [Fact]
    public async Task Recurring_Materializes_Once()
    {
        var (db, auth, exp, _, _, _, recur) = Setup();
        var (a, b, g) = await SeedGroup(auth, db);
        db.RecurringRules.Add(new RecurringRule
        {
            GroupId = g.Id, Title = "Rent", AmountCents = 100000, PayerId = a.Id,
            ParticipantIdsJson = System.Text.Json.JsonSerializer.Serialize(new[] { a.Id, b.Id }),
            Frequency = "monthly", NextRunAt = DateTime.UtcNow.AddMinutes(-1), CreatedBy = a.Id
        });
        await db.SaveChangesAsync();
        Assert.Equal(1, await recur.MaterializeDueAsync(g.Id));
        Assert.Equal(0, await recur.MaterializeDueAsync(g.Id)); // idempotent: nothing due
        Assert.Equal(1, await db.Expenses.CountAsync(e => e.GroupId == g.Id && e.DeletedAt == null));
    }

    [Fact]
    public async Task Nudge_Throttle_Is_Per_Day()
    {
        var (db, auth, exp, _, _, ledger, _) = Setup();
        var (a, b, g) = await SeedGroup(auth, db);
        await exp.CreateAsync(a.Id, g.Id, "D", null, 30m, a.Id, SplitType.Equal,
            [a.Id, b.Id], null, null, null);
        var cutoff = DateTime.UtcNow.AddDays(-1);
        Assert.False(await db.Nudges.AnyAsync(n => n.GroupId == g.Id && n.FromUserId == a.Id
            && n.ToUserId == b.Id && n.CreatedAt >= cutoff));
        db.Nudges.Add(new Nudge { GroupId = g.Id, FromUserId = a.Id, ToUserId = b.Id });
        await db.SaveChangesAsync();
        Assert.True(await db.Nudges.AnyAsync(n => n.GroupId == g.Id && n.FromUserId == a.Id
            && n.ToUserId == b.Id && n.CreatedAt >= cutoff));
    }
}
