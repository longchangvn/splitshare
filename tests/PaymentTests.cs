using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using SplitShare.Api.Auth;
using SplitShare.Api.Data;
using SplitShare.Api.Expenses;
using SplitShare.Api.Models;
using SplitShare.Api.Payments;
using SplitShare.Api.Services;

namespace SplitShare.Tests;

public sealed class PaymentTests
{
    private static (AppDbContext Db, AuthService Auth, ExpenseService Exp, PaymentService Pay) Setup()
    {
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Jwt:Key"] = new string('k', 64) }).Build();
        var ledger = new LedgerService(db);
        var auth = new AuthService(db, new TokenService(config),
            new StubEmailSender(NullLogger<StubEmailSender>.Instance), ledger);
        return (db, auth, new ExpenseService(db, ledger, new FakeStore()), new PaymentService(db, ledger));
    }

    private static async Task<(User A, User B, Group G)> SeedAsync(AuthService auth, AppDbContext db)
    {
        var a = (await auth.RegisterAsync("paya", "paya@x.io", "A", "pass1234", null)).User!;
        var b = (await auth.RegisterAsync("payb", "payb@x.io", "B", "pass1234", null)).User!;
        var g = new Group { Name = "PG", CreatedBy = a.Id };
        db.Groups.Add(g);
        db.GroupMembers.AddRange(
            new GroupMember { GroupId = g.Id, UserId = a.Id, Role = "owner" },
            new GroupMember { GroupId = g.Id, UserId = b.Id });
        await db.SaveChangesAsync();
        return (a, b, g);
    }

    [Fact]
    public async Task Record_Validates_And_Partial()
    {
        var (db, auth, exp, pay) = Setup();
        var (a, b, g) = await SeedAsync(auth, db);
        await exp.CreateAsync(a.Id, g.Id, "D", null, 30m, a.Id,
            SplitType.Equal, [a.Id, b.Id], null, null, null);
        // A net +1500, B net -1500.

        Assert.Equal("VALIDATION", (await pay.RecordAsync(a.Id, g.Id, a.Id, a.Id, 5m, "cash", null)).ErrorCode);
        Assert.Equal("FORBIDDEN", (await pay.RecordAsync(
            (await auth.RegisterAsync("payc", "payc@x.io", "C", "pass1234", null)).User!.Id,
            g.Id, b.Id, a.Id, 5m, "cash", null)).ErrorCode); // outsider cannot record
        var over = await pay.RecordAsync(b.Id, g.Id, b.Id, a.Id, 20m, "cash", null);
        Assert.Equal("OVERPAYMENT", over.ErrorCode);

        var partial = await pay.RecordAsync(b.Id, g.Id, b.Id, a.Id, 10m, "cash", "half");
        Assert.True(partial.Ok);
        var rec = (PaymentRecorded)partial.Data!;
        Assert.False(rec.FullySettled);
        var second = await pay.RecordAsync(b.Id, g.Id, b.Id, a.Id, 10m, "cash", null);
        Assert.Equal("OVERPAYMENT", second.ErrorCode); // only 5 left
        var exact = await pay.RecordAsync(b.Id, g.Id, b.Id, a.Id, 5m, "transfer", null);
        Assert.True(((PaymentRecorded)exact.Data!).FullySettled);
    }

    [Fact]
    public async Task FullSettle_LocksEverything_And_BlocksEdits()
    {
        var (db, auth, exp, pay) = Setup();
        var (a, b, g) = await SeedAsync(auth, db);
        var created = (ExpenseCreated)(await exp.CreateAsync(a.Id, g.Id, "D", null, 20m, a.Id,
            SplitType.Equal, [a.Id, b.Id], null, null, null)).Data!;
        var rec = (PaymentRecorded)(await pay.RecordAsync(b.Id, g.Id, b.Id, a.Id, 10m, "cash", null)).Data!;
        Assert.True(rec.FullySettled);

        var e = await db.Expenses.FindAsync(created.Expense.Id);
        Assert.Equal(ExpenseStatus.Locked, e!.Status);
        Assert.All(await db.Payments.Where(p => p.GroupId == g.Id).ToListAsync(),
            p => Assert.Equal(ExpenseStatus.Locked, p.Status));

        Assert.Equal("EXPENSE_LOCKED",
            (await exp.UpdateAsync(a.Id, created.Expense.Id, 1, "X", null, null, null, null, null, null, null, null)).ErrorCode);
        Assert.Equal("ALREADY_SETTLED",
            (await pay.RecordAsync(a.Id, g.Id, a.Id, b.Id, 1m, "cash", null)).ErrorCode);
        Assert.Equal("EXPENSE_LOCKED",
            (await pay.ReverseAsync(a.Id, rec.Payment.Id)).ErrorCode); // locked since
    }

    [Fact]
    public async Task Reverse_Within24h_OwnerOnly()
    {
        var (db, auth, exp, pay) = Setup();
        var (a, b, g) = await SeedAsync(auth, db);
        await exp.CreateAsync(a.Id, g.Id, "D", null, 20m, a.Id,
            SplitType.Equal, [a.Id, b.Id], null, null, null);
        var rec = (PaymentRecorded)(await pay.RecordAsync(b.Id, g.Id, b.Id, a.Id, 5m, "cash", null)).Data!;

        Assert.Equal("FORBIDDEN", (await pay.ReverseAsync(b.Id, rec.Payment.Id)).ErrorCode);
        Assert.True((await pay.ReverseAsync(a.Id, rec.Payment.Id)).Ok);
        Assert.Equal("NOT_FOUND", (await pay.ReverseAsync(a.Id, rec.Payment.Id)).ErrorCode); // already reversed
    }
}
