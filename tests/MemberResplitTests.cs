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

public sealed class MemberResplitTests
{
    private static readonly Guid A = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid B = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid C = Guid.Parse("33333333-3333-3333-3333-333333333333");
    private static readonly Guid X = Guid.Parse("99999999-9999-9999-9999-999999999999");

    private static Expense Exp(SplitType type, long amount, Guid payer, params ExpenseSplit[] splits)
        => new() { SplitType = type, AmountCents = amount, PayerId = payer, Splits = [.. splits] };

    private static ExpenseSplit S(Guid u, long share, long? exact = null, decimal? pct = null, int? shares = null)
        => new() { UserId = u, ShareCents = share, ExactCents = exact, Percent = pct, Shares = shares };

    private static Dictionary<Guid, ResplitLine> Run(Expense e)
    {
        var r = MemberResplit.Resplit(e, X);
        Assert.DoesNotContain(r.Lines, l => l.UserId == X);
        Assert.Equal(e.AmountCents, r.Lines.Sum(l => l.ShareCents));
        return r.Lines.ToDictionary(l => l.UserId);
    }

    [Fact]
    public void Equal_RedividesAmongRemaining_RemainderToLowestId()
    {
        var r = Run(Exp(SplitType.Equal, 10000, A, S(A, 2500), S(B, 2500), S(C, 2500), S(X, 2500)));
        Assert.Equal(3334, r[A].ShareCents);
        Assert.Equal(3333, r[B].ShareCents);
        Assert.Equal(3333, r[C].ShareCents);
    }

    [Fact]
    public void Shares_DropsRemovedShares_KeepsRemainingWeights()
    {
        // A2 B1 X1 of 12.00 → A 8.00, B 4.00; stored shares unchanged.
        var r = Run(Exp(SplitType.Shares, 1200, A,
            S(A, 600, shares: 2), S(B, 300, shares: 1), S(X, 300, shares: 1)));
        Assert.Equal(800, r[A].ShareCents);
        Assert.Equal(400, r[B].ShareCents);
        Assert.Equal(2, r[A].Shares);
        Assert.Equal(1, r[B].Shares);
    }

    [Fact]
    public void Shares_UnevenRemainder_UsesLargestRemainder()
    {
        // A1 B2 X3 of 10.00 → remaining 1:2 of 1000 → 333.33 / 666.67 → A 333, B 667.
        var r = Run(Exp(SplitType.Shares, 1000, A,
            S(A, 167, shares: 1), S(B, 333, shares: 2), S(X, 500, shares: 3)));
        Assert.Equal(333, r[A].ShareCents);
        Assert.Equal(667, r[B].ShareCents);
    }

    [Fact]
    public void Percent_ScalesRemainingTo100()
    {
        // A50 B30 X20 → A 62.50 %, B 37.50 % of 10.00.
        var r = Run(Exp(SplitType.Percent, 1000, A,
            S(A, 500, pct: 50m), S(B, 300, pct: 30m), S(X, 200, pct: 20m)));
        Assert.Equal(625, r[A].ShareCents);
        Assert.Equal(375, r[B].ShareCents);
        Assert.Equal(62.50m, r[A].Percent);
        Assert.Equal(37.50m, r[B].Percent);
    }

    [Fact]
    public void Percent_NonTerminatingRatios_StoredPercentsSumTo100AndRevalidate()
    {
        // A10 B20 C30 X40 → 16.67 / 33.33 / 50.00 (sum exactly 100.00).
        var e = Exp(SplitType.Percent, 9999, B,
            S(A, 1000, pct: 10m), S(B, 2000, pct: 20m), S(C, 2999, pct: 30m), S(X, 4000, pct: 40m));
        var r = Run(e);
        Assert.Equal(16.67m, r[A].Percent);
        Assert.Equal(33.33m, r[B].Percent);
        Assert.Equal(50.00m, r[C].Percent);
        Assert.Equal(100.00m, r.Values.Sum(l => l.Percent!.Value));
        // Stored percents must reproduce the same shares when the expense is edited later.
        var (again, err) = SplitService.Percent(9999, r.Values.Select(l => new PercentEntry(l.UserId, l.Percent!.Value)).ToList());
        Assert.Null(err);
        foreach (var l in r.Values) Assert.Equal(l.ShareCents, again![l.UserId]);
    }

    [Fact]
    public void Exact_KeepsAmounts_SpreadsRemovedAmountProportionally()
    {
        // A 5.00 B 3.00 X 2.00 → X's 2.00 split 5:3 → A 6.25, B 3.75.
        var r = Run(Exp(SplitType.Exact, 1000, C,
            S(A, 500, exact: 500), S(B, 300, exact: 300), S(X, 200, exact: 200)));
        Assert.Equal(625, r[A].ShareCents);
        Assert.Equal(375, r[B].ShareCents);
        Assert.Equal(625, r[A].ExactCents);
        Assert.Equal(375, r[B].ExactCents);
        Assert.Null(SplitService.Exact(1000, r.Values.Select(l => new ExactEntry(l.UserId, l.ExactCents!.Value)).ToList()).Error);
    }

    [Fact]
    public void Exact_AllRemainingZero_SpreadsEqually()
    {
        var r = Run(Exp(SplitType.Exact, 1001, A, S(A, 0, exact: 0), S(B, 0, exact: 0), S(X, 1001, exact: 1001)));
        Assert.Equal(501, r[A].ShareCents);
        Assert.Equal(500, r[B].ShareCents);
    }

    [Fact]
    public void LegacyRows_WithoutMethodMetadata_UseStoredShares()
    {
        var pct = Run(Exp(SplitType.Percent, 1000, A, S(A, 500), S(B, 250), S(X, 250)));
        Assert.Equal(667, pct[A].ShareCents); // 66.67 %
        Assert.Equal(333, pct[B].ShareCents);
        var exact = Run(Exp(SplitType.Exact, 1000, A, S(A, 600), S(B, 200), S(X, 200)));
        Assert.Equal(750, exact[A].ShareCents);
        Assert.Equal(250, exact[B].ShareCents);
    }

    [Fact]
    public void Guests_CoveredByRemoved_JoinBase_OthersStayOnCoverer()
    {
        // Base 10.00 equal A/B/X (334/333/333) + guest 3.00 by A + guest 2.00 by X = 15.00.
        var e = Exp(SplitType.Equal, 1500, B, S(A, 634), S(B, 333), S(X, 533));
        var gA = new ExpenseGuest { CoveredByUserId = A, ShareCents = 300, Label = "Kid A" };
        var gX = new ExpenseGuest { CoveredByUserId = X, ShareCents = 200, Label = "Kid X" };
        e.Guests = [gA, gX];
        var res = MemberResplit.Resplit(e, X);
        var r = res.Lines.ToDictionary(l => l.UserId);
        Assert.Equal([gX.Id], res.DroppedGuestIds);
        // New base 12.00 (10.00 + X's guest) → 6.00 each; A also keeps its guest.
        Assert.Equal(900, r[A].ShareCents);
        Assert.Equal(600, r[B].ShareCents);
        Assert.Equal(1500, res.Lines.Sum(l => l.ShareCents));
    }

    [Fact]
    public void SoleParticipant_PayerBearsWholeAmount_ForEveryMethod()
    {
        foreach (var t in Enum.GetValues<SplitType>())
        {
            var r = Run(Exp(t, 4321, A, S(X, 4321, exact: 4321, pct: 100m, shares: 3)));
            Assert.Equal(4321, r[A].ShareCents);
        }
    }

    [Fact]
    public void RemovedPayer_Throws()
        => Assert.Throws<InvalidOperationException>(() =>
            MemberResplit.Resplit(Exp(SplitType.Equal, 100, X, S(A, 50), S(X, 50)), X));

    // ---- end-to-end through GroupService.RemoveMemberAsync ----

    private sealed record Ctx(AppDbContext Db, ExpenseService Exp, GroupService Groups, LedgerService Ledger,
        User Owner, User B, User C, User X, Guid Gid);

    private static async Task<Ctx> Seed()
    {
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            { ["Jwt:Key"] = new string('k', 64), ["App:BaseUrl"] = "http://test" }).Build();
        var ledger = new LedgerService(db);
        var mail = new StubEmailSender(NullLogger<StubEmailSender>.Instance);
        var auth = new AuthService(db, new TokenService(config), mail, ledger);
        var groups = new GroupService(db, ledger, mail, config, new CategoryService(db), new GroupStatusPolicy(db));
        var exp = new ExpenseService(db, ledger, new FakeStore(), new CategoryService(db));
        async Task<User> Reg(string n) => (await auth.RegisterAsync(n, $"{n}@x.io", n, "pass1234", null)).User!;
        var o = await Reg("rs-owner"); var b = await Reg("rs-b"); var c = await Reg("rs-c"); var x = await Reg("rs-x");
        var g = (GroupCreated)(await groups.CreateAsync(o.Id, "Resplit", "USD", [b.Id, c.Id, x.Id], [])).Data!;
        return new(db, exp, groups, ledger, o, b, c, x, g.Group.Id);
    }

    private static async Task<Guid> Add(Ctx k, decimal amount, Guid payer, SplitType t, List<Guid> parts,
        List<ExactEntry>? ex = null, List<PercentEntry>? pc = null, List<ShareEntry>? sh = null, ExpenseOptions? opts = null)
    {
        var r = await k.Exp.CreateAsync(k.Owner.Id, k.Gid, $"{t}", null, amount, payer, t, parts, ex, pc, sh, opts);
        Assert.True(r.Ok, r.Error);
        return ((ExpenseCreated)r.Data!).Expense.Id;
    }

    private static async Task<Dictionary<Guid, ExpenseSplit>> Splits(Ctx k, Guid eid)
        => await k.Db.ExpenseSplits.Where(s => s.ExpenseId == eid).ToDictionaryAsync(s => s.UserId);

    [Fact]
    public async Task Remove_AcrossExpensesWithDifferentMethods_EachFollowsItsOwnMethod()
    {
        var k = await Seed();
        Guid o = k.Owner.Id, b = k.B.Id, c = k.C.Id, x = k.X.Id;
        var eEqual = await Add(k, 90m, o, SplitType.Equal, [o, b, c, x]);
        var eShares = await Add(k, 100m, b, SplitType.Shares, [o, b, x], sh: [new(o, 1), new(b, 1), new(x, 2)]);
        var ePct = await Add(k, 60m, c, SplitType.Percent, [o, c, x], pc: [new(o, 25m), new(c, 25m), new(x, 50m)]);
        var eExact = await Add(k, 50m, o, SplitType.Exact, [b, c, x], ex: [new(b, 1000), new(c, 1500), new(x, 2500)]);
        var eUntouched = await Add(k, 40m, o, SplitType.Equal, [o, b]);
        var eTax = await Add(k, 30m, b, SplitType.Equal, [b, c, x], opts: new ExpenseOptions(Tax: 3m, Tip: 0.01m));

        var preview = (RemovalPreview)(await k.Groups.RemovalPreviewAsync(o, k.Gid, x)).Data!;
        Assert.True(preview.CanRemove, string.Join(";", preview.Blockers));
        Assert.True(preview.NetCents < 0);
        Assert.Equal(5, preview.Expenses.Count);
        Assert.DoesNotContain(preview.Expenses, ch => ch.ExpenseId == eUntouched);

        var removed = await k.Groups.RemoveMemberAsync(o, k.Gid, x, "resplit", preview.InputsHash);
        Assert.True(removed.Ok, removed.Error);
        Assert.Equal(5, ((MemberRemoved)removed.Data!).ResplitExpenses);

        var eq = await Splits(k, eEqual);
        Assert.Equal([3000L, 3000L, 3000L], new[] { eq[o].ShareCents, eq[b].ShareCents, eq[c].ShareCents });
        var shs = await Splits(k, eShares);
        Assert.Equal(5000, shs[o].ShareCents); Assert.Equal(5000, shs[b].ShareCents);
        Assert.Equal(1, shs[o].Shares); Assert.Equal(1, shs[b].Shares);
        var pct = await Splits(k, ePct);
        Assert.Equal(3000, pct[o].ShareCents); Assert.Equal(3000, pct[c].ShareCents);
        Assert.Equal(50m, pct[o].Percent); Assert.Equal(50m, pct[c].Percent);
        var exact = await Splits(k, eExact);
        Assert.Equal(2000, exact[b].ShareCents); Assert.Equal(3000, exact[c].ShareCents);
        Assert.Equal(2000, exact[b].ExactCents); Assert.Equal(3000, exact[c].ExactCents);
        var tax = await Splits(k, eTax); // 33.01 incl. tax+tip → b/c, remainder cent to lower id
        Assert.Equal(3301, tax.Values.Sum(s => s.ShareCents));
        Assert.Equal(1, Math.Abs(tax[b].ShareCents - tax[c].ShareCents));
        var untouched = await Splits(k, eUntouched);
        Assert.Equal(2000, untouched[o].ShareCents); Assert.Equal(2000, untouched[b].ShareCents);

        foreach (var id in new[] { eEqual, eShares, ePct, eExact, eTax })
        {
            var e = await k.Db.Expenses.Include(z => z.Splits).SingleAsync(z => z.Id == id);
            Assert.DoesNotContain(e.Splits, s => s.UserId == x);
            Assert.Equal(e.AmountCents, e.Splits.Sum(s => s.ShareCents));
            Assert.Equal(2, e.Version);
            Assert.Contains(k.Db.ExpenseAudits, a => a.ExpenseId == id && a.DiffJson.Contains("member_removed"));
        }
        Assert.Equal(SplitType.Percent, (await k.Db.Expenses.FindAsync(ePct))!.SplitType);
        Assert.Equal(1, (await k.Db.Expenses.FindAsync(eUntouched))!.Version);

        var nets = (await k.Ledger.ComputeNetsAsync(k.Gid))!.Nets;
        Assert.False(nets.ContainsKey(x));
        Assert.Equal(0, nets.Values.Sum());
        foreach (var (u, v) in preview.NetsAfter) Assert.Equal(v, nets[u]);
        Assert.Null(await k.Db.GroupMembers.FindAsync(k.Gid, x));
        Assert.NotNull(await k.Db.MembershipArchives.FindAsync(k.Gid, x));

        // Re-split percents/exacts stay valid input for a later edit by the existing service.
        var edit = await k.Exp.UpdateAsync(o, ePct, 2, null, null, 80m, null, null, null,
            null, [new(o, 50m), new(c, 50m)], null);
        Assert.True(edit.Ok, edit.Error);
    }

    [Fact]
    public async Task Remove_Blocked_WhenRemovedMemberPaidOpenExpense_NothingChanges()
    {
        var k = await Seed();
        Guid o = k.Owner.Id, x = k.X.Id;
        var e1 = await Add(k, 30m, o, SplitType.Equal, [o, x]);
        await Add(k, 10m, x, SplitType.Equal, [o, x]);

        var r = await k.Groups.RemoveMemberAsync(o, k.Gid, x, "resplit");
        Assert.Equal("HAS_OPEN_BALANCE", r.ErrorCode);
        Assert.Contains("Paid open expense", r.Error);
        Assert.NotNull(await k.Db.GroupMembers.FindAsync(k.Gid, x));
        Assert.Equal(1500, (await Splits(k, e1))[x].ShareCents);
    }

    [Fact]
    public async Task Remove_Blocked_WhenPaymentsLeaveResidual()
    {
        var k = await Seed();
        Guid o = k.Owner.Id, x = k.X.Id;
        await Add(k, 30m, o, SplitType.Equal, [o, x]);
        k.Db.Payments.Add(new Payment { GroupId = k.Gid, FromUserId = x, ToUserId = o, AmountCents = 500, CreatedBy = x });
        await k.Db.SaveChangesAsync();

        var preview = (RemovalPreview)(await k.Groups.RemovalPreviewAsync(o, k.Gid, x)).Data!;
        Assert.False(preview.CanRemove);
        var r = await k.Groups.RemoveMemberAsync(o, k.Gid, x, "resplit");
        Assert.Equal("HAS_OPEN_BALANCE", r.ErrorCode);
        Assert.Contains("payments", r.Error);
    }

    [Fact]
    public async Task Remove_SettledMember_DoesNotRewriteHistory()
    {
        var k = await Seed();
        Guid o = k.Owner.Id, x = k.X.Id;
        var e1 = await Add(k, 30m, o, SplitType.Equal, [o, x]);
        k.Db.Payments.Add(new Payment { GroupId = k.Gid, FromUserId = x, ToUserId = o, AmountCents = 1500, CreatedBy = x });
        await k.Db.SaveChangesAsync();

        var r = await k.Groups.RemoveMemberAsync(o, k.Gid, x, "resplit");
        Assert.True(r.Ok, r.Error);
        Assert.Equal(0, ((MemberRemoved)r.Data!).ResplitExpenses);
        Assert.Equal(1500, (await Splits(k, e1))[x].ShareCents);
    }

    [Fact]
    public async Task Remove_StaleHash_NonOwner_And_NoStrategy_AreRejected()
    {
        var k = await Seed();
        Guid o = k.Owner.Id, x = k.X.Id;
        await Add(k, 30m, o, SplitType.Equal, [o, x]);
        var preview = (RemovalPreview)(await k.Groups.RemovalPreviewAsync(o, k.Gid, x)).Data!;
        await Add(k, 10m, o, SplitType.Equal, [o, x]); // ledger moves on

        Assert.Equal("STALE_LEDGER", (await k.Groups.RemoveMemberAsync(o, k.Gid, x, "resplit", preview.InputsHash)).ErrorCode);
        Assert.Equal("FORBIDDEN", (await k.Groups.RemoveMemberAsync(k.B.Id, k.Gid, x, "resplit")).ErrorCode);
        Assert.Equal("FORBIDDEN", (await k.Groups.RemovalPreviewAsync(k.B.Id, k.Gid, x)).ErrorCode);
        Assert.Equal("HAS_OPEN_BALANCE", (await k.Groups.RemoveMemberAsync(o, k.Gid, x)).ErrorCode);
        Assert.Equal("VALIDATION", (await k.Groups.RemoveMemberAsync(o, k.Gid, x, "redistribute")).ErrorCode);
        Assert.NotNull(await k.Db.GroupMembers.FindAsync(k.Gid, x));
    }

    [Fact]
    public async Task Remove_GuestCoveredByRemoved_And_SoleParticipant()
    {
        var k = await Seed();
        Guid o = k.Owner.Id, b = k.B.Id, x = k.X.Id;
        var withGuest = await Add(k, 20m, o, SplitType.Equal, [o, b, x],
            opts: new ExpenseOptions(Guests: [new("Kid", 600, x)]));
        var solo = await Add(k, 12m, o, SplitType.Shares, [x], sh: [new(x, 2)]);

        var r = await k.Groups.RemoveMemberAsync(o, k.Gid, x, "resplit");
        Assert.True(r.Ok, r.Error);
        var g = await Splits(k, withGuest); // 20.00 + 6.00 guest → 13.00 each
        Assert.Equal(1300, g[o].ShareCents); Assert.Equal(1300, g[b].ShareCents);
        Assert.Empty(k.Db.ExpenseGuests.Where(z => z.ExpenseId == withGuest));
        var s = await Splits(k, solo);
        Assert.Single(s);
        Assert.Equal(1200, s[o].ShareCents);
        Assert.Equal(1, s[o].Shares);
        Assert.Equal(0, (await k.Ledger.ComputeNetsAsync(k.Gid))!.Nets.Values.Sum());
    }
}
