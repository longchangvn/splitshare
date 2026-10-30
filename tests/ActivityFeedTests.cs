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

/// <summary>Spec 005 A1: GET /me/activity plus the shared group feed builder.</summary>
public sealed class ActivityFeedTests
{
    private static (AppDbContext Db, AuthService Auth, ExpenseService Exp, ActivityService Activity) Setup()
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
        return (db, auth,
            new ExpenseService(db, ledger, new FakeStore(), new CategoryService(db)),
            new ActivityService(db));
    }

    private static async Task<(User A, User B, Group G)> SeedAsync(AuthService auth, AppDbContext db, string name)
    {
        var a = (await auth.RegisterAsync($"aa{name}", $"aa{name}@x.io", $"Alice{name}", "pass1234", null)).User!;
        var b = (await auth.RegisterAsync($"ab{name}", $"ab{name}@x.io", $"Bob{name}", "pass1234", null)).User!;
        var g = new Group { Name = $"G{name}", CreatedBy = a.Id };
        db.Groups.Add(g);
        db.GroupMembers.AddRange(
            new GroupMember { GroupId = g.Id, UserId = a.Id, Role = "owner" },
            new GroupMember { GroupId = g.Id, UserId = b.Id });
        await db.SaveChangesAsync();
        return (a, b, g);
    }

    [Fact]
    public async Task Group_Feed_Is_Newest_First_And_Scoped()
    {
        var (db, auth, exp, activity) = Setup();
        var (a, b, g) = await SeedAsync(auth, db, "one");
        var (_, _, other) = await SeedAsync(auth, db, "two");
        await exp.CreateAsync(a.Id, g.Id, "Dinner", null, 30m, a.Id,
            SplitType.Equal, [a.Id, b.Id], null, null, null);
        await exp.CreateAsync(a.Id, other.Id, "Elsewhere", null, 10m, a.Id,
            SplitType.Equal, [a.Id], null, null, null);

        var rows = await activity.GroupFeedAsync(g.Id, 50);
        Assert.Contains(rows, r => r.Kind == "expense" && r.Text.Contains("Dinner"));
        Assert.DoesNotContain(rows, r => r.Text.Contains("Elsewhere"));
        Assert.Equal(rows.OrderByDescending(r => r.At).Select(r => r.At), rows.Select(r => r.At));
        Assert.Contains(rows, r => r.Kind == "join");
    }

    [Fact]
    public async Task User_Feed_Only_Lists_Groups_The_Caller_Belongs_To()
    {
        var (db, auth, exp, activity) = Setup();
        var (a, _, g) = await SeedAsync(auth, db, "mine");
        var (stranger, _, foreign) = await SeedAsync(auth, db, "theirs");
        await exp.CreateAsync(a.Id, g.Id, "Mine", null, 12m, a.Id,
            SplitType.Equal, [a.Id], null, null, null);
        await exp.CreateAsync(stranger.Id, foreign.Id, "Theirs", null, 9m, stranger.Id,
            SplitType.Equal, [stranger.Id], null, null, null);

        var (items, _) = await activity.UserFeedAsync(a.Id, 20);
        Assert.Contains(items, r => r.Text.Contains("Mine") && r.GroupId == g.Id);
        Assert.DoesNotContain(items, r => r.Text.Contains("Theirs"));
        // Every row carries its group name for the mobile row subtitle.
        Assert.All(items, r => Assert.Equal($"Gmine", r.GroupName));
    }

    [Fact]
    public async Task Paging_Cursor_Returns_Next_Page_Without_Overlap()
    {
        var (db, auth, exp, activity) = Setup();
        var (a, b, g) = await SeedAsync(auth, db, "page");
        for (var i = 0; i < 5; i++)
            await exp.CreateAsync(a.Id, g.Id, $"E{i}", null, 10m + i, a.Id,
                SplitType.Equal, [a.Id, b.Id], null, null, null);

        var (first, cursor) = await activity.UserFeedAsync(a.Id, 3);
        Assert.Equal(3, first.Count);
        Assert.NotNull(cursor);

        var (second, _) = await activity.UserFeedAsync(a.Id, 3, cursor);
        Assert.NotEmpty(second);
        Assert.Empty(first.Select(r => r.At).Intersect(second.Select(r => r.At)));
    }

    [Fact]
    public async Task Single_Group_Filter_And_Non_Member_Are_Handled()
    {
        var (db, auth, exp, activity) = Setup();
        var (a, b, g) = await SeedAsync(auth, db, "filter");
        var (_, _, g2) = await SeedAsync(auth, db, "filter2");
        db.GroupMembers.Add(new GroupMember { GroupId = g2.Id, UserId = a.Id });
        await db.SaveChangesAsync();
        await exp.CreateAsync(a.Id, g.Id, "OnlyG", null, 10m, a.Id,
            SplitType.Equal, [a.Id, b.Id], null, null, null);

        var (items, _) = await activity.UserFeedAsync(a.Id, 20, null, g.Id);
        Assert.All(items, r => Assert.Equal(g.Id, r.GroupId));

        var (foreign, cursor) = await activity.UserFeedAsync(a.Id, 20, null, Guid.NewGuid());
        Assert.Empty(foreign);
        Assert.Null(cursor);
    }

    [Fact]
    public async Task Empty_And_Large_Group_Counts_Stay_Clamped()
    {
        var (db, auth, _, activity) = Setup();
        var a = (await auth.RegisterAsync("solo", "solo@x.io", "Solo", "pass1234", null)).User!;

        var (none, cursor) = await activity.UserFeedAsync(a.Id, 20);
        Assert.Empty(none);
        Assert.Null(cursor);

        for (var i = 0; i < 4; i++)
        {
            var g = new Group { Name = $"Many{i}", CreatedBy = a.Id };
            db.Groups.Add(g);
            db.GroupMembers.Add(new GroupMember { GroupId = g.Id, UserId = a.Id, Role = "owner" });
        }
        await db.SaveChangesAsync();

        var (one, _) = await activity.UserFeedAsync(a.Id, 1);
        Assert.Single(one);
    }
}
