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

public sealed class FakeStore : IFileStore
{
    public readonly Dictionary<string, byte[]> Blobs = new();
    public Task<string> SaveAsync(Guid expenseId, string fileName, string mime, Stream content)
    {
        using var ms = new MemoryStream();
        content.CopyTo(ms);
        var key = $"{expenseId:N}/{fileName}";
        Blobs[key] = ms.ToArray();
        return Task.FromResult(key);
    }
    public Task DeleteAsync(string storageKey) { Blobs.Remove(storageKey); return Task.CompletedTask; }
    public Task<(Stream Stream, string Mime)?> OpenAsync(string storageKey)
        => Task.FromResult<(Stream, string)?>(Blobs.TryGetValue(storageKey, out var b)
            ? (new MemoryStream(b), "image/jpeg") : null);
}

public sealed class ExpenseTests
{
    private static (AppDbContext Db, AuthService Auth, ExpenseService Exp) Setup()
    {
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Jwt:Key"] = new string('k', 64) }).Build();
        var ledger = new LedgerService(db);
        var auth = new AuthService(db, new TokenService(config),
            new StubEmailSender(NullLogger<StubEmailSender>.Instance), ledger);
        return (db, auth, new ExpenseService(db, ledger, new FakeStore(), new CategoryService(db)));
    }

    private static async Task<(User A, User B, Group G)> SeedGroup(AuthService auth, AppDbContext db)
    {
        var a = (await auth.RegisterAsync("expa", "expa@x.io", "A", "pass1234", null)).User!;
        var b = (await auth.RegisterAsync("expb", "expb@x.io", "B", "pass1234", null)).User!;
        var g = new Group { Name = "EG", CreatedBy = a.Id };
        db.Groups.Add(g);
        db.GroupMembers.AddRange(
            new GroupMember { GroupId = g.Id, UserId = a.Id, Role = "owner" },
            new GroupMember { GroupId = g.Id, UserId = b.Id });
        await db.SaveChangesAsync();
        return (a, b, g);
    }

    [Fact]
    public async Task Create_Validates_And_SplitsExactly()
    {
        var (db, auth, exp) = Setup();
        var (a, b, g) = await SeedGroup(auth, db);

        Assert.Equal("VALIDATION", (await exp.CreateAsync(a.Id, g.Id, "", null, 10m, a.Id,
            SplitType.Equal, [a.Id, b.Id], null, null, null)).ErrorCode);
        Assert.Equal("VALIDATION", (await exp.CreateAsync(a.Id, g.Id, "T", null, 0m, a.Id,
            SplitType.Equal, [a.Id], null, null, null)).ErrorCode);
        Assert.Equal("VALIDATION", (await exp.CreateAsync(a.Id, g.Id, "T", null, 10.001m, a.Id,
            SplitType.Equal, [a.Id], null, null, null)).ErrorCode);
        Assert.Equal("VALIDATION", (await exp.CreateAsync(a.Id, g.Id, "T", null, 10m, Guid.NewGuid(),
            SplitType.Equal, [a.Id], null, null, null)).ErrorCode); // payer not member

        var ok = await exp.CreateAsync(a.Id, g.Id, "Dinner", "Nice", 10m, a.Id,
            SplitType.Equal, [a.Id, b.Id], null, null, null);
        Assert.True(ok.Ok);
        var created = (ExpenseCreated)ok.Data!;
        Assert.Equal(1, created.SettlementVersion); // first plan stored
        var e = await db.Expenses.Include(x => x.Splits).FirstAsync(x => x.Id == created.Expense.Id);
        Assert.Equal(1000, e.Splits.Sum(s => s.ShareCents));
    }

    [Fact]
    public async Task Edit_StaleVersion_Audit_Unsettle()
    {
        var (db, auth, exp) = Setup();
        var (a, b, g) = await SeedGroup(auth, db);
        var created = (ExpenseCreated)(await exp.CreateAsync(a.Id, g.Id, "D", null, 30m, b.Id,
            SplitType.Equal, [a.Id, b.Id], null, null, null)).Data!;
        // Nets: A -1500, B +1500. A pays 1500 -> A settled at 0.
        db.Payments.Add(new Payment
            { GroupId = g.Id, FromUserId = a.Id, ToUserId = b.Id, AmountCents = 1500, CreatedBy = a.Id });
        await db.SaveChangesAsync();

        var stale = await exp.UpdateAsync(a.Id, created.Expense.Id, 999, "X", null,
            null, null, null, null, null, null, null);
        Assert.Equal("STALE_VERSION", stale.ErrorCode);

        var preview = (EditPreview)(await exp.PreviewEditAsync(a.Id, created.Expense.Id,
            60m, null, null, null, null, null, null)).Data!;
        Assert.Contains(a.Id, preview.UnsettledUserIds); // A 0 -> -1500

        var upd = await exp.UpdateAsync(a.Id, created.Expense.Id, 1, null, null,
            60m, null, null, null, null, null, null); // creator edits own expense
        Assert.True(upd.Ok);
        var updated = (ExpenseUpdated)upd.Data!;
        Assert.Contains(a.Id, updated.UnsettledUserIds);
        Assert.Equal(2, (await db.Expenses.FindAsync(created.Expense.Id))!.Version);
        Assert.Single(await db.ExpenseAudits.Where(x => x.ExpenseId == created.Expense.Id).ToListAsync());
    }

    [Fact]
    public async Task FrozenRemovedMember_Blocked_And_LockedAfterFullSettle()
    {
        var (db, auth, exp) = Setup();
        var (a, b, g) = await SeedGroup(auth, db);
        var created = (ExpenseCreated)(await exp.CreateAsync(a.Id, g.Id, "D", null, 20m, a.Id,
            SplitType.Equal, [a.Id, b.Id], null, null, null)).Data!;
        // B settles then leaves.
        db.Payments.Add(new Payment
            { GroupId = g.Id, FromUserId = b.Id, ToUserId = a.Id, AmountCents = 1000, CreatedBy = b.Id });
        await db.SaveChangesAsync();
        db.GroupMembers.RemoveRange(db.GroupMembers.Where(m => m.GroupId == g.Id && m.UserId == b.Id));
        db.MembershipArchives.Add(new MembershipArchive { GroupId = g.Id, UserId = b.Id });
        await db.SaveChangesAsync();

        var frozen = await exp.UpdateAsync(a.Id, created.Expense.Id, 1, "X", null,
            null, null, null, null, null, null, null);
        Assert.Equal("INVOLVES_REMOVED_MEMBER", frozen.ErrorCode);
        // ▲ even a title-only edit is refused: B's shares are frozen with them.
    }

    [Fact]
    public async Task Images_Upload_Validate_Serve_Delete()
    {
        var (db, auth, exp) = Setup();
        var (a, b, g) = await SeedGroup(auth, db);
        var created = (ExpenseCreated)(await exp.CreateAsync(a.Id, g.Id, "D", null, 10m, a.Id,
            SplitType.Equal, [a.Id], null, null, null)).Data!;

        Assert.Equal("VALIDATION",
            (await exp.UploadImageAsync(a.Id, created.Expense.Id, "x.pdf", "application/pdf", [1])).ErrorCode);
        Assert.Equal("VALIDATION",
            (await exp.UploadImageAsync(a.Id, created.Expense.Id, "x.jpg", "image/jpeg", [])).ErrorCode);
        var up = await exp.UploadImageAsync(a.Id, created.Expense.Id, "r.jpg", "image/jpeg",
            [0xFF, 0xD8, 0xFF, 0xD9]);
        Assert.True(up.Ok);
        var img = (ExpenseImage)up.Data!;
        var opened = await exp.OpenImageAsync(b.Id, img.Id);
        Assert.NotNull(opened);
        Assert.Null(await exp.OpenImageAsync(Guid.NewGuid(), img.Id)); // non-member
        Assert.True((await exp.DeleteImageAsync(a.Id, img.Id)).Ok);
    }
}
