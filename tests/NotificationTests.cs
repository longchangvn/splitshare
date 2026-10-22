using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using SplitShare.Api.Auth;
using SplitShare.Api.Data;
using SplitShare.Api.Expenses;
using SplitShare.Api.Groups;
using SplitShare.Api.Models;
using SplitShare.Api.Notifications;
using SplitShare.Api.Payments;
using SplitShare.Api.Services;

namespace SplitShare.Tests;

/// <summary>Records every send; optionally throws to prove best-effort.</summary>
public sealed class RecordingNotificationProvider : INotificationProvider
{
    public readonly List<(IReadOnlyCollection<Guid> Users, NotificationMessage Message)> Sends = [];
    public bool ThrowOnSend { get; set; }

    public Task SendToUsersAsync(IReadOnlyCollection<Guid> userIds, NotificationMessage message, CancellationToken ct = default)
    {
        if (ThrowOnSend) throw new InvalidOperationException("provider down");
        Sends.Add((userIds.ToArray(), message));
        return Task.CompletedTask;
    }
}

public sealed class NotificationTests
{
    private static (AppDbContext Db, AuthService Auth, ExpenseService Exp, PaymentService Pay, RecordingNotificationProvider Push)
        Setup()
    {
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Key"] = new string('k', 64),
                ["App:BaseUrl"] = "http://localhost:3000"
            }).Build();
        var ledger = new LedgerService(db);
        var auth = new AuthService(db, new TokenService(config),
            new StubEmailSender(NullLogger<StubEmailSender>.Instance), ledger);
        var push = new RecordingNotificationProvider();
        var notifier = new GroupNotifier(db, push, config, NullLogger<GroupNotifier>.Instance);
        return (db, auth,
            new ExpenseService(db, ledger, new FakeStore(), new CategoryService(db)),
            new PaymentService(db, ledger, null, notifier),
            push);
    }

    private static async Task<(User A, User B, User C, Group G)> SeedAsync(AuthService auth, AppDbContext db)
    {
        var a = (await auth.RegisterAsync("noa", "noa@x.io", "Alice", "pass1234", null)).User!;
        var b = (await auth.RegisterAsync("nob", "nob@x.io", "Bob", "pass1234", null)).User!;
        var c = (await auth.RegisterAsync("noc", "noc@x.io", "Carol", "pass1234", null)).User!;
        var g = new Group { Name = "Trip", CreatedBy = a.Id };
        db.Groups.Add(g);
        db.GroupMembers.AddRange(
            new GroupMember { GroupId = g.Id, UserId = a.Id, Role = "owner" },
            new GroupMember { GroupId = g.Id, UserId = b.Id },
            new GroupMember { GroupId = g.Id, UserId = c.Id });
        await db.SaveChangesAsync();
        return (a, b, c, g);
    }

    [Fact]
    public async Task Expense_Notifies_All_Members_Except_Actor()
    {
        var (db, auth, exp, _, push) = Setup();
        var (a, b, c, g) = await SeedAsync(auth, db);

        var op = await exp.CreateAsync(a.Id, g.Id, "Dinner", null, 45.20m, a.Id,
            SplitType.Equal, [a.Id, b.Id, c.Id], null, null, null);
        Assert.True(op.Ok);

        var send = Assert.Single(push.Sends);
        // Targets everyone except the actor.
        Assert.Equal(new[] { b.Id, c.Id }.OrderBy(x => x), send.Users.OrderBy(x => x));
        Assert.Contains("Alice", send.Message.Title);           // actor display name
        Assert.Contains("added an expense", send.Message.Title);
        Assert.Contains("Dinner", send.Message.Body);           // expense title
        Assert.Contains("45.20", send.Message.Body);            // amount
        Assert.Equal($"http://localhost:3000/groups/{g.Id}", send.Message.Url);
        Assert.Equal(g.Id, send.Message.GroupId);
    }

    [Fact]
    public async Task Payment_Notifies_All_Members_Except_Actor()
    {
        var (db, auth, exp, pay, push) = Setup();
        var (a, b, c, g) = await SeedAsync(auth, db);
        await exp.CreateAsync(a.Id, g.Id, "Dinner", null, 30m, a.Id,
            SplitType.Equal, [a.Id, b.Id, c.Id], null, null, null);
        push.Sends.Clear();

        var op = await pay.RecordAsync(b.Id, g.Id, b.Id, a.Id, 10m, "cash", null);
        Assert.True(op.Ok);

        var send = Assert.Single(push.Sends);
        Assert.Equal(new[] { a.Id, c.Id }.OrderBy(x => x), send.Users.OrderBy(x => x));
        Assert.DoesNotContain(b.Id, send.Users);                // actor (payer) excluded
        Assert.Contains("Bob", send.Message.Title);
        Assert.Contains("recorded a payment", send.Message.Title);
        Assert.Contains("10.00", send.Message.Body);
    }

    [Fact]
    public async Task Two_Member_Group_Targets_Only_The_Other()
    {
        var (db, auth, exp, _, push) = Setup();
        var (a, b, c, g) = await SeedAsync(auth, db);
        db.GroupMembers.RemoveRange(db.GroupMembers.Where(m => m.GroupId == g.Id && m.UserId == c.Id)); // two-member group
        await db.SaveChangesAsync();

        await exp.CreateAsync(a.Id, g.Id, "Cab", null, 12m, a.Id,
            SplitType.Equal, [a.Id, b.Id], null, null, null);

        var send = Assert.Single(push.Sends);
        Assert.Equal(new[] { b.Id }, send.Users.ToArray());      // only the other member
    }

    [Fact]
    public async Task Provider_Failure_Does_Not_Fail_Expense_Or_Payment()
    {
        var (db, auth, exp, pay, push) = Setup();
        var (a, b, _, g) = await SeedAsync(auth, db);
        push.ThrowOnSend = true;

        var expense = await exp.CreateAsync(a.Id, g.Id, "Safe", null, 10m, a.Id,
            SplitType.Equal, [a.Id, b.Id], null, null, null);
        Assert.True(expense.Ok); // money op unaffected by push outage

        var payment = await pay.RecordAsync(b.Id, g.Id, b.Id, a.Id, 5m, "cash", null);
        Assert.True(payment.Ok);
    }

    [Fact]
    public async Task No_Sends_When_Group_Is_Single_Member()
    {
        var (db, auth, exp, _, push) = Setup();
        var (a, _, _, g) = await SeedAsync(auth, db);
        db.GroupMembers.RemoveRange(db.GroupMembers.Where(m => m.GroupId == g.Id && m.Role != "owner"));
        await db.SaveChangesAsync();

        await exp.CreateAsync(a.Id, g.Id, "Solo", null, 9m, a.Id,
            SplitType.Equal, [a.Id], null, null, null);

        Assert.Empty(push.Sends); // only the actor → nothing to send
    }

    // --- Factory (task 4.2) ---

    private static IConfiguration Cfg(string? provider) => new ConfigurationBuilder()
        .AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Notification:Provider"] = provider,
            ["Notification:OneSignal:AppId"] = "95038e0d-3c11-4469-8ee4-e1580d4d0edd",
            ["Notification:OneSignal:ApiKey"] = "test-key"
        }).Build();

    [Fact]
    public void Factory_Selects_By_Config()
    {
        Assert.IsType<NullNotificationProvider>(NotificationProviderFactory.Create(Cfg(null))); // default: no push
        Assert.IsType<NullNotificationProvider>(NotificationProviderFactory.Create(Cfg("")));
        Assert.IsType<OneSignalProvider>(NotificationProviderFactory.Create(Cfg("OneSignal"), new FakeHttpFactory()));
        Assert.Throws<InvalidOperationException>(() => NotificationProviderFactory.Create(Cfg("expo")));
        Assert.Throws<InvalidOperationException>(() => NotificationProviderFactory.Create(Cfg("onesignal"))); // needs HttpClient factory
    }

    private sealed class FakeHttpFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new();
    }
}
