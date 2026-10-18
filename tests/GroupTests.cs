using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using SplitShare.Api.Auth;
using SplitShare.Api.Data;
using SplitShare.Api.Groups;
using SplitShare.Api.Models;
using SplitShare.Api.Services;

namespace SplitShare.Tests;

public sealed class GroupTests
{
    private static (AppDbContext Db, AuthService Auth, GroupService Groups) Setup()
    {
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Key"] = new string('k', 64),
                ["App:BaseUrl"] = "http://test"
            }).Build();
        var auth = new AuthService(db, new TokenService(config),
            new StubEmailSender(NullLogger<StubEmailSender>.Instance), new LedgerService(db));
        return (db, auth, new GroupService(db, new LedgerService(db),
            new StubEmailSender(NullLogger<StubEmailSender>.Instance), config));
    }

    private static async Task<User> Reg(AuthService auth, string name)
        => (await auth.RegisterAsync(name, $"{name}@x.io", name, "pass1234", null)).User!;

    [Fact]
    public async Task Create_Validates_And_SetsOwner()
    {
        var (db, auth, groups) = Setup();
        var a = await Reg(auth, "gowner");
        var bad = await groups.CreateAsync(a.Id, "AB", "USD", [], []);
        Assert.Equal("VALIDATION", bad.ErrorCode);
        var badCur = await groups.CreateAsync(a.Id, "Trip", "USDD", [], []);
        Assert.Equal("VALIDATION", badCur.ErrorCode);
        var ok = await groups.CreateAsync(a.Id, "Trip", "usd", [], []);
        Assert.True(ok.Ok);
        Assert.Equal("owner", await groups.RoleAsync(((GroupCreated)ok.Data!).Group.Id, a.Id));
    }

    [Fact]
    public async Task AddMembers_NonMemberForbidden_And_Caps()
    {
        var (db, auth, groups) = Setup();
        var a = await Reg(auth, "ga1");
        var b = await Reg(auth, "gb1");
        var g = await groups.CreateAsync(a.Id, "Group", "USD", [], []);
        Guid gid = ((GroupCreated)g.Data!).Group.Id;
        var outsider = await groups.AddMembersAsync(b.Id, gid, [a.Id]);
        Assert.Equal("FORBIDDEN", outsider.ErrorCode);
        var ghost = await groups.AddMembersAsync(a.Id, gid, [Guid.NewGuid()]);
        Assert.Equal("VALIDATION", ghost.ErrorCode);
        var added = await groups.AddMembersAsync(a.Id, gid, [b.Id]);
        Assert.True(added.Ok);
    }

    [Fact]
    public async Task Invite_Pending_ConsumedOnRegister()
    {
        var (db, auth, groups) = Setup();
        var a = await Reg(auth, "ga2");
        var g = await groups.CreateAsync(a.Id, "Group2", "USD", [], []);
        Guid gid = ((GroupCreated)g.Data!).Group.Id;
        var inv = await groups.InviteEmailsAsync(a.Id, gid, ["newbie@x.io"]);
        Assert.True(inv.Ok);
        Assert.Empty(await groups.ConsumePendingInvitesAsync("newbie@x.io", Guid.NewGuid())); // unknown user: skip
        var n = await Reg(auth, "newbie");
        var joined = await groups.ConsumePendingInvitesAsync("newbie@x.io", n.Id);
        Assert.Equal(new List<Guid> { gid }, joined);
        Assert.Equal("member", await groups.RoleAsync(gid, n.Id));
    }

    [Fact]
    public async Task Invite_RegisteredUser_AddedDirectly()
    {
        var (db, auth, groups) = Setup();
        var a = await Reg(auth, "ga3");
        var b = await Reg(auth, "gb3");
        var g = await groups.CreateAsync(a.Id, "Group3", "USD", [], []);
        Guid gid = ((GroupCreated)g.Data!).Group.Id;
        var inv = await groups.InviteEmailsAsync(a.Id, gid, ["gb3@x.io"]);
        Assert.True(inv.Ok);
        Assert.Equal("member", await groups.RoleAsync(gid, b.Id));
    }

    [Fact]
    public async Task Remove_BlockedByBalance_And_Leave()
    {
        var (db, auth, groups) = Setup();
        var a = await Reg(auth, "ga4");
        var b = await Reg(auth, "gb4");
        var g = await groups.CreateAsync(a.Id, "Group4", "USD", [b.Id], []);
        Guid gid = ((GroupCreated)g.Data!).Group.Id;
        db.Expenses.Add(new Expense
        {
            GroupId = gid, Title = "T", AmountCents = 2000, PayerId = a.Id, CreatedBy = a.Id,
            Splits = [new ExpenseSplit { UserId = a.Id, ShareCents = 1000 },
                      new ExpenseSplit { UserId = b.Id, ShareCents = 1000 }]
        });
        await db.SaveChangesAsync();

        var blocked = await groups.RemoveMemberAsync(a.Id, gid, b.Id);
        Assert.Equal("HAS_OPEN_BALANCE", blocked.ErrorCode);
        var memberLeave = await groups.LeaveAsync(b.Id, gid);
        Assert.Equal("HAS_OPEN_BALANCE", memberLeave.ErrorCode);
        db.Payments.Add(new Payment
            { GroupId = gid, FromUserId = b.Id, ToUserId = a.Id, AmountCents = 1000, CreatedBy = b.Id });
        await db.SaveChangesAsync();
        Assert.True((await groups.LeaveAsync(b.Id, gid)).Ok);
        Assert.True((await db.MembershipArchives.FindAsync(gid, b.Id)) is not null);
    }

    [Fact]
    public async Task SoleOwner_CannotLeave_And_JoinNeedsNoVerification()
    {
        var (db, auth, groups) = Setup();
        var a = await Reg(auth, "ga5");
        var g = await groups.CreateAsync(a.Id, "Group5", "USD", [], []);
        Guid gid = ((GroupCreated)g.Data!).Group.Id;
        var leave = await groups.LeaveAsync(a.Id, gid);
        Assert.Equal("VALIDATION", leave.ErrorCode);

        var b = await Reg(auth, "gb5");
        // token-possession join works for unverified emails (links are undeliverable in prod)
        var token = ((Group)db.Groups.Find(gid)!).InviteToken;
        var joined = await groups.JoinByTokenAsync(b.Id, token);
        Assert.True(joined.Ok);
        Assert.True(await db.GroupMembers.FindAsync(gid, b.Id) is not null);
        // stale token rejected
        var stale = await groups.JoinByTokenAsync(b.Id, "nope");
        Assert.Equal("INVITE_ROTATED", stale.ErrorCode);
    }

    [Fact]
    public async Task Rotate_InvalidatesOldToken_And_DeleteGuarded()
    {
        var (db, auth, groups) = Setup();
        var a = await Reg(auth, "ga6");
        var g = await groups.CreateAsync(a.Id, "Group6", "USD", [], []);
        Guid gid = ((GroupCreated)g.Data!).Group.Id;
        var old = ((Group)db.Groups.Find(gid)!).InviteToken;
        await groups.RotateInviteAsync(a.Id, gid);
        Assert.Equal("INVITE_ROTATED", (await groups.JoinByTokenAsync(a.Id, old)).ErrorCode);

        // delete empty group ok
        Assert.True((await groups.DeleteAsync(a.Id, gid)).Ok);
        // delete with open balance blocked
        var g2 = await groups.CreateAsync(a.Id, "G6b", "USD", [], []);
        Guid gid2 = ((GroupCreated)g2.Data!).Group.Id;
        var b = await Reg(auth, "gb6");
        await groups.AddMembersAsync(a.Id, gid2, [b.Id]);
        db.Expenses.Add(new Expense
        {
            GroupId = gid2, Title = "T", AmountCents = 2000, PayerId = a.Id, CreatedBy = a.Id,
            Splits = [new ExpenseSplit { UserId = b.Id, ShareCents = 2000 }]
        });
        await db.SaveChangesAsync();
        Assert.Equal("HAS_OPEN_BALANCE", (await groups.DeleteAsync(a.Id, gid2)).ErrorCode);
    }
}
