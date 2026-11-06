using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using SplitShare.Api.Auth;
using SplitShare.Api.Data;
using SplitShare.Api.Groups;
using SplitShare.Api.Models;
using SplitShare.Api.Services;

namespace SplitShare.Tests;

/// <summary>Email invites: per-address send results, resend, and the /invite/{token} accept flow.</summary>
public sealed class InvitationTests
{
    private sealed class FakeEmail : IEmailSender
    {
        public readonly List<(string To, string Subject, string Body)> Sent = [];
        public readonly List<bool> Transactional = [];
        public Func<string, EmailSendResult> Respond = _ => EmailSendResult.Accepted("msg-1");
        public Task<EmailSendResult> SendAsync(string to, string subject, string body, bool transactional = false)
        {
            Sent.Add((to, subject, body));
            Transactional.Add(transactional);
            return Task.FromResult(Respond(to));
        }
    }

    private static (AppDbContext Db, AuthService Auth, GroupService Groups, FakeEmail Mail) Setup()
    {
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:Key"] = new string('k', 64),
            ["App:BaseUrl"] = "http://test"
        }).Build();
        var mail = new FakeEmail();
        var auth = new AuthService(db, new TokenService(config), mail, new LedgerService(db), config);
        var groups = new GroupService(db, new LedgerService(db), mail, config, new CategoryService(db), new GroupStatusPolicy(db));
        return (db, auth, groups, mail);
    }

    private static async Task<User> Reg(AuthService auth, string name)
        => (await auth.RegisterAsync(name, $"{name}@x.io", name, "pass1234", null)).User!;

    private static async Task<Guid> NewGroup(GroupService groups, Guid owner, string name = "Trip")
        => ((GroupCreated)(await groups.CreateAsync(owner, name, "USD", [], [])).Data!).Group.Id;

    private static string TokenFor(FakeEmail mail, string to)
        => Regex.Match(mail.Sent.Last(m => m.To == to).Body, @"http://test/invite/([0-9A-F]+)").Groups[1].Value;

    [Fact]
    public async Task Invite_Reports_Per_Email_Send_Result()
    {
        var (db, auth, groups, mail) = Setup();
        var owner = await Reg(auth, "owner1");
        var member = await Reg(auth, "member1");
        var gid = await NewGroup(groups, owner.Id);
        mail.Sent.Clear();
        mail.Transactional.Clear();
        mail.Respond = to => to == "bounce@x.io"
            ? EmailSendResult.Fail("Email provider rejected the message (HTTP 400).")
            : EmailSendResult.Accepted("msg-ok");

        var r = await groups.InviteEmailsAsync(owner.Id, gid, ["Member1@x.io", "new@x.io", "bounce@x.io", "NEW@x.io"]);

        Assert.True(r.Ok);
        var data = (InvitesResult)r.Data!;
        Assert.Empty(data.Added); // registered users are invited too, never added up front
        Assert.Equal(["member1@x.io", "new@x.io", "bounce@x.io"], data.Pending);
        Assert.Null(await db.GroupMembers.FindAsync(gid, member.Id));
        var results = data.Results!;
        Assert.Equal(3, results.Count); // case-insensitive de-dup
        Assert.Equal(new InviteOutcome("member1@x.io", "invited", true, "sent", null), results[0]);
        Assert.Equal(new InviteOutcome("new@x.io", "invited", true, "sent", null), results[1]);
        Assert.Equal("failed", results[2].EmailStatus);
        Assert.False(results[2].EmailSent);
        Assert.Contains("HTTP 400", results[2].EmailError);
        // Invites reach addresses unsubscribed from non-essential mail.
        Assert.Equal(3, mail.Transactional.Count);
        Assert.All(mail.Transactional, Assert.True);
    }

    [Fact]
    public async Task Stub_Sender_Is_Reported_As_Not_Sent()
    {
        var (db, _, _, _) = Setup();
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            { ["Jwt:Key"] = new string('k', 64) }).Build();
        var stub = new StubEmailSender(Microsoft.Extensions.Logging.Abstractions.NullLogger<StubEmailSender>.Instance);
        var auth = new AuthService(db, new TokenService(config), stub, new LedgerService(db));
        var groups = new GroupService(db, new LedgerService(db), stub, config, new CategoryService(db), new GroupStatusPolicy(db));
        var owner = await Reg(auth, "owner2");
        var gid = await NewGroup(groups, owner.Id);

        var r = (InvitesResult)(await groups.InviteEmailsAsync(owner.Id, gid, ["someone@x.io"])).Data!;

        var only = Assert.Single(r.Results!);
        Assert.False(only.EmailSent);
        Assert.Equal("not_configured", only.EmailStatus);
        Assert.Equal(["someone@x.io"], r.Pending); // the invite itself still stands
    }

    [Fact]
    public async Task Invalid_Email_Rejects_Before_Anything_Is_Saved_Or_Sent()
    {
        var (db, auth, groups, mail) = Setup();
        var owner = await Reg(auth, "owner3");
        var gid = await NewGroup(groups, owner.Id);
        mail.Sent.Clear();

        var r = await groups.InviteEmailsAsync(owner.Id, gid, ["ok@x.io", "not-an-email"]);

        Assert.Equal("VALIDATION", r.ErrorCode);
        Assert.Empty(mail.Sent);
        Assert.False(await db.PendingInvites.AnyAsync());
    }

    [Fact]
    public async Task Reinvite_Resends_And_Rotates_The_Link()
    {
        var (db, auth, groups, mail) = Setup();
        var owner = await Reg(auth, "owner4");
        var gid = await NewGroup(groups, owner.Id);
        await groups.InviteEmailsAsync(owner.Id, gid, ["again@x.io"]);
        var first = TokenFor(mail, "again@x.io");
        await groups.InviteEmailsAsync(owner.Id, gid, ["again@x.io"]);
        var second = TokenFor(mail, "again@x.io");

        Assert.Equal(2, mail.Sent.Count(m => m.To == "again@x.io"));
        Assert.NotEqual(first, second);
        Assert.Equal(1, await db.PendingInvites.CountAsync(p => p.Email == "again@x.io"));
        Assert.Equal("INVITE_INVALID", (await groups.InvitationPreviewAsync(first)).ErrorCode);
        Assert.True((await groups.InvitationPreviewAsync(second)).Ok);
    }

    [Fact]
    public async Task Preview_Shows_Group_And_Gmail_Hint()
    {
        var (_, auth, groups, mail) = Setup();
        var owner = await Reg(auth, "owner5");
        var gid = await NewGroup(groups, owner.Id, "Beach");
        await groups.InviteEmailsAsync(owner.Id, gid, ["friend@gmail.com", "pal@x.io"]);

        var gmail = (InvitePreview)(await groups.InvitationPreviewAsync(TokenFor(mail, "friend@gmail.com"))).Data!;
        Assert.Equal(new InvitePreview("friend@gmail.com", "Beach", "USD", 1, "owner5", true, false), gmail);
        Assert.Contains("Google", mail.Sent.Single(m => m.To == "friend@gmail.com").Body);

        var other = (InvitePreview)(await groups.InvitationPreviewAsync(TokenFor(mail, "pal@x.io"))).Data!;
        Assert.False(other.IsGmail);
        Assert.Contains("choose a password", mail.Sent.Single(m => m.To == "pal@x.io").Body);
        Assert.Equal("INVITE_INVALID", (await groups.InvitationPreviewAsync("nope")).ErrorCode);
    }

    [Fact]
    public async Task Accept_Creates_Default_User_Joins_Only_This_Group()
    {
        var (db, auth, groups, mail) = Setup();
        var owner = await Reg(auth, "owner6");
        var gid = await NewGroup(groups, owner.Id, "Main");
        var other = await NewGroup(groups, owner.Id, "Other");
        await groups.InviteEmailsAsync(owner.Id, other, ["Jane.Doe@x.io"]);
        await groups.InviteEmailsAsync(owner.Id, gid, ["jane.doe@x.io"]);
        var token = TokenFor(mail, "jane.doe@x.io");

        var r = await groups.AcceptInvitationAsync(token, "secret123", auth);

        Assert.True(r.Ok, r.Error);
        var a = (InviteAccepted)r.Data!;
        Assert.Equal(gid, a.GroupId);
        var u = await db.Users.SingleAsync(x => x.Email == "jane.doe@x.io");
        Assert.Equal("jane.doe", u.Username);
        Assert.Equal("jane.doe", u.DisplayName);
        Assert.NotNull(u.EmailVerifiedAt);
        Assert.Equal("member", await groups.RoleAsync(gid, u.Id));
        // The other group's invite waits for its own link.
        Assert.Null(await groups.RoleAsync(other, u.Id));
        Assert.Null((await db.PendingInvites.SingleAsync(p => p.GroupId == other)).ConsumedAt);
        Assert.True((await auth.LoginAsync("jane.doe@x.io", "secret123")).Ok);

        Assert.Equal("INVITE_USED", (await groups.AcceptInvitationAsync(token, "secret123", auth)).ErrorCode);
        Assert.Equal("INVITE_USED", (await groups.InvitationPreviewAsync(token)).ErrorCode);
    }

    [Fact]
    public async Task Accept_Picks_A_Free_Username()
    {
        var (db, auth, groups, mail) = Setup();
        var owner = await Reg(auth, "owner7");
        await Reg(auth, "sam");
        var gid = await NewGroup(groups, owner.Id);
        await groups.InviteEmailsAsync(owner.Id, gid, ["sam@other.io"]);

        Assert.True((await groups.AcceptInvitationAsync(TokenFor(mail, "sam@other.io"), "secret123", auth)).Ok);
        Assert.Equal("sam-1", (await db.Users.SingleAsync(x => x.Email == "sam@other.io")).Username);
    }

    [Fact]
    public async Task Accept_Rejections_Leave_No_Account()
    {
        var (db, auth, groups, mail) = Setup();
        var owner = await Reg(auth, "owner8");
        var gid = await NewGroup(groups, owner.Id);
        await groups.InviteEmailsAsync(owner.Id, gid, ["weak@x.io", "late@x.io", "locked@x.io"]);

        Assert.Equal("VALIDATION", (await groups.AcceptInvitationAsync(TokenFor(mail, "weak@x.io"), "short", auth)).ErrorCode);
        Assert.Equal("VALIDATION", (await groups.AcceptInvitationAsync(TokenFor(mail, "weak@x.io"), null, auth)).ErrorCode);

        var late = await db.PendingInvites.SingleAsync(p => p.Email == "late@x.io");
        late.CreatedAt = DateTime.UtcNow.AddDays(-GroupService.InviteDays - 1);
        await db.SaveChangesAsync();
        Assert.Equal("INVITE_EXPIRED", (await groups.AcceptInvitationAsync(TokenFor(mail, "late@x.io"), "secret123", auth)).ErrorCode);

        Assert.True((await groups.UpdateStatusAsync(owner.Id, gid, "locked")).Ok);
        Assert.Equal("GROUP_READ_ONLY",
            (await groups.AcceptInvitationAsync(TokenFor(mail, "locked@x.io"), "secret123", auth)).ErrorCode);

        Assert.Equal(1, await db.Users.CountAsync()); // only the owner
    }

    [Fact]
    public async Task Accept_When_Account_Exists_Asks_To_Log_In()
    {
        var (_, auth, groups, mail) = Setup();
        var owner = await Reg(auth, "owner9");
        var gid = await NewGroup(groups, owner.Id);
        await groups.InviteEmailsAsync(owner.Id, gid, ["late-signup@x.io"]);
        var token = TokenFor(mail, "late-signup@x.io");
        // Registered through some other path that did not consume the invite.
        await auth.RegisterAsync("latesignup", "late-signup@x.io", "Late", "pass1234", null);

        Assert.True(((InvitePreview)(await groups.InvitationPreviewAsync(token)).Data!).AccountExists);
        Assert.Equal("ACCOUNT_EXISTS", (await groups.AcceptInvitationAsync(token, "secret123", auth)).ErrorCode);
    }

    [Fact]
    public async Task Google_Signin_Joins_Only_Through_The_Link_Once()
    {
        var (db, auth, groups, mail) = Setup();
        var owner = await Reg(auth, "owner10");
        var gid = await NewGroup(groups, owner.Id);
        await groups.InviteEmailsAsync(owner.Id, gid, ["pat@gmail.com"]);
        var token = TokenFor(mail, "pat@gmail.com");

        // Google sign-in creates the account with default fields but joins nothing by itself.
        var g = await auth.GoogleAsync(new GoogleIdentity("sub-pat", "Pat@gmail.com", true));
        Assert.Equal("pat", g.User!.Username);
        Assert.Null(await groups.RoleAsync(gid, g.User.Id));

        // The invitation page then joins through the link.
        var join = (JoinedGroup)(await groups.JoinInvitationAsync(g.User.Id, token)).Data!;
        Assert.False(join.AlreadyMember);
        Assert.Equal(gid, join.GroupId);
        Assert.True(((JoinedGroup)(await groups.JoinInvitationAsync(g.User.Id, token)).Data!).AlreadyMember);

        var stranger = await Reg(auth, "stranger");
        Assert.Equal("INVITE_USED", (await groups.JoinInvitationAsync(stranger.Id, token)).ErrorCode);
        Assert.Null(await db.GroupMembers.FindAsync(gid, stranger.Id));
    }

    [Fact]
    public async Task Join_With_A_Different_Account_Consumes_The_Invite()
    {
        var (db, auth, groups, mail) = Setup();
        var owner = await Reg(auth, "owner11");
        var gid = await NewGroup(groups, owner.Id);
        await groups.InviteEmailsAsync(owner.Id, gid, ["work@x.io"]);
        var token = TokenFor(mail, "work@x.io");
        var personal = await Reg(auth, "personal");

        var r = await groups.JoinInvitationAsync(personal.Id, token);

        Assert.True(r.Ok);
        Assert.False(((JoinedGroup)r.Data!).AlreadyMember);
        Assert.Equal("member", await groups.RoleAsync(gid, personal.Id));
        Assert.NotNull((await db.PendingInvites.SingleAsync()).ConsumedAt);
    }

    [Fact]
    public async Task Registered_User_Joins_Only_After_Opening_The_Link()
    {
        var (db, auth, groups, mail) = Setup();
        var owner = await Reg(auth, "owner13");
        var member = await Reg(auth, "known");
        var gid = await NewGroup(groups, owner.Id, "Known");

        await groups.InviteEmailsAsync(owner.Id, gid, ["known@x.io"]);

        Assert.Null(await groups.RoleAsync(gid, member.Id)); // not added before confirming
        var token = TokenFor(mail, "known@x.io");
        Assert.NotEmpty(token);
        Assert.Contains("log in to join", mail.Sent.Last(m => m.To == "known@x.io").Body);
        var preview = (InvitePreview)(await groups.InvitationPreviewAsync(token)).Data!;
        Assert.True(preview.AccountExists);
        Assert.Equal("Known", preview.GroupName);
        Assert.Equal("owner13", preview.InvitedBy);
        var join = (JoinedGroup)(await groups.JoinInvitationAsync(member.Id, token)).Data!;
        Assert.False(join.AlreadyMember);
        Assert.Equal("member", await groups.RoleAsync(gid, member.Id));
        Assert.NotNull((await db.PendingInvites.SingleAsync(p => p.Email == "known@x.io")).ConsumedAt);
    }

    [Fact]
    public async Task Create_Group_With_Invites_Returns_Send_Results()
    {
        var (_, auth, groups, mail) = Setup();
        var owner = await Reg(auth, "owner12");
        mail.Respond = _ => EmailSendResult.Fail("Email provider unreachable.");

        var created = (GroupCreated)(await groups.CreateAsync(owner.Id, "Wizard", "USD", [], ["a@x.io"])).Data!;

        Assert.Equal(1, created.PendingInvites);
        var only = Assert.Single(created.Invites!.Results!);
        Assert.False(only.EmailSent);
        Assert.Equal("Email provider unreachable.", only.EmailError);
    }
}
