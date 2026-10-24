using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SplitShare.Api.Data;
using SplitShare.Api.Models;
using SplitShare.Api.Services;

namespace SplitShare.Api.Expenses;

public sealed record ExpenseOp(bool Ok, string? ErrorCode, string? Error, object? Data = null);

public sealed record ExpenseCreated(Expense Expense, List<Guid> UnsettledUserIds, int SettlementVersion);
public sealed record ExpenseUpdated(Expense Expense, List<Guid> UnsettledUserIds, int SettlementVersion);
public sealed record ExpenseDeleted(List<Guid> UnsettledUserIds, int SettlementVersion);
public sealed record ExpensePreview(Dictionary<Guid, long> Shares);
public sealed record EditPreview(Dictionary<Guid, long> Shares, List<Guid> UnsettledUserIds);
public sealed record StatusResult(string Status);
public sealed record GuestEntry(string Label, long AmountCents, Guid CoveredBy);

/// <summary>Trip-pack additive create/update fields. Null = keep default / unchanged.</summary>
public sealed record ExpenseOptions(
    string? Category = null,
    DateTime? SpentAt = null,
    decimal? Tax = null,
    decimal? Tip = null,
    decimal? Fee = null,
    string? OrigCurrency = null,
    decimal? OrigAmount = null,
    decimal? FxRate = null,
    List<GuestEntry>? Guests = null,
    bool OnlyPresent = false);

public sealed class ExpenseService(AppDbContext db, LedgerService ledger, IFileStore files,
    Groups.CategoryService categories, Auth.IEmailSender? email = null,
    Groups.GroupStatusPolicy? statusPolicy = null,
    Notifications.GroupNotifier? notifier = null)
{
    public const long MaxAmountCents = 100_000_000; // 1,000,000.00
    public const long MaxImageBytes = 10 * 1024 * 1024;
    public const int MaxImages = 5;
    public static readonly HashSet<string> AllowedMimes = new(StringComparer.OrdinalIgnoreCase)
        { "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif",
          "image/heic-sequence", "image/heif-sequence" };

    public static string NormalizeImageMime(string? fileName, string? mime)
    {
        // Browsers sometimes send empty or non-standard content types (e.g. HEIC
        // from iOS, or image/jpg). Infer from filename when missing.
        var norm = (mime ?? "").Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(norm) || norm == "application/octet-stream")
        {
            norm = Path.GetExtension(fileName ?? "").ToLowerInvariant() switch
            {
                ".jpg" or ".jpeg" => "image/jpeg",
                ".png" => "image/png",
                ".webp" => "image/webp",
                ".heic" => "image/heic",
                ".heif" => "image/heif",
                _ => norm
            };
        }
        return norm == "image/jpg" ? "image/jpeg" : norm;
    }

    public static (long Cents, string? Error) ParseAmount(decimal amount)
    {
        if (amount <= 0) return (0, "Amount must be > 0.");
        if (amount > 1_000_000m) return (0, "Amount exceeds 1,000,000.00.");
        if (amount * 100m != Math.Floor(amount * 100m))
            return (0, "Amount supports max 2 decimals.");
        return ((long)(amount * 100m), null);
    }

    private async Task<GroupMember?> MemberAsync(Guid groupId, Guid userId)
        => await db.GroupMembers.FindAsync(groupId, userId);

    private Task<Groups.GroupWriteDecision> CheckGroupWriteAsync(Guid groupId, Guid actorId)
        => (statusPolicy ?? new Groups.GroupStatusPolicy(db)).CheckWriteAsync(groupId, actorId);

    private async Task<List<Guid>> ArchivedNonMembersAsync(Guid groupId, IEnumerable<Guid> ids)
    {
        var list = ids.Distinct().ToList();
        var archived = await db.MembershipArchives
            .Where(a => a.GroupId == groupId && list.Contains(a.UserId)).Select(a => a.UserId).ToListAsync();
        var current = await db.GroupMembers.Where(m => m.GroupId == groupId && list.Contains(m.UserId))
            .Select(m => m.UserId).ToListAsync();
        return archived.Except(current).ToList();
    }

    public async Task<ExpenseOp> ResolveShares(SplitType type, long total, List<Guid> participants,
        List<ExactEntry>? exact, List<PercentEntry>? percent, List<ShareEntry>? shares)
    {
        participants = participants.Distinct().ToList();
        if (participants.Count is 0 or > 50)
            return new(false, "VALIDATION", "1-50 participants required.");
        return type switch
        {
            SplitType.Equal => new(true, null, null, SplitService.Equal(total, participants)),
            SplitType.Exact when exact is not null && exact.Select(e => e.UserId).ToHashSet().SetEquals(participants)
                => SplitService.Exact(total, exact) is var (s, e) && e is null
                    ? new(true, null, null, s) : new(false, "VALIDATION", e),
            SplitType.Percent when percent is not null && percent.Select(e => e.UserId).ToHashSet().SetEquals(participants)
                => SplitService.Percent(total, percent) is var (s, e) && e is null
                    ? new(true, null, null, s) : new(false, "VALIDATION", e),
            SplitType.Shares when shares is not null && shares.Select(e => e.UserId).ToHashSet().SetEquals(participants)
                => SplitService.Shares(total, shares) is var (s, e) && e is null
                    ? new(true, null, null, s) : new(false, "VALIDATION", e),
            _ => new(false, "VALIDATION", "Split detail must cover exactly the participants.")
        };
    }

    private async Task<ExpenseOp> GuardAsync(Guid groupId, Guid actorId, Guid? expenseId, bool needWriter)
    {
        var g = await db.Groups.FindAsync(groupId);
        if (g is null || g.DeletedAt is not null) return new(false, "NOT_FOUND", "Group not found.");
        var role = (await MemberAsync(groupId, actorId))?.Role;
        if (role is null) return new(false, "FORBIDDEN", "Not a group member.");
        if (needWriter)
        {
            var write = await CheckGroupWriteAsync(groupId, actorId);
            if (!write.Allowed) return new(false, write.ErrorCode, write.Error);
        }
        Expense? e = null;
        if (expenseId is not null)
        {
            e = await db.Expenses.Include(x => x.Splits).Include(x => x.Images).Include(x => x.Guests)
                .FirstOrDefaultAsync(x => x.Id == expenseId && x.GroupId == groupId && x.DeletedAt == null);
            if (e is null) return new(false, "NOT_FOUND", "Expense not found.");
            if (e.Status != ExpenseStatus.Open) return new(false, "EXPENSE_LOCKED", "Settled expense is locked.");
            if (needWriter && e.CreatedBy != actorId && role != "owner" && role != "treasurer")
                return new(false, "FORBIDDEN", "Only the creator, an owner or the treasurer can modify.");
        }
        return new(true, null, null, new GuardData(g, role, e));
    }
    private sealed record GuardData(Group Group, string Role, Expense? Expense);

    public static (long Cents, string? Error) ParseExtra(decimal amount, string name)
    {
        if (amount < 0) return (0, $"{name} must be >= 0.");
        if (amount > 1_000_000m) return (0, $"{name} exceeds 1,000,000.00.");
        if (amount * 100m != Math.Floor(amount * 100m))
            return (0, $"{name} supports max 2 decimals.");
        return ((long)(amount * 100m), null);
    }

    public static (DateTime At, string? Error) ParseSpentAt(DateTime? spentAt)
    {
        var at = spentAt ?? DateTime.UtcNow;
        if (at.Kind == DateTimeKind.Unspecified) at = DateTime.SpecifyKind(at, DateTimeKind.Utc);
        else at = at.ToUniversalTime();
        if (at > DateTime.UtcNow.AddDays(1)) return (at, "spent_at cannot be more than 24h in the future.");
        return (at, null);
    }

    /// <summary>Manual FX: orig triple (all-or-nothing) converts to group-currency cents.</summary>
    public static (long Cents, string? OrigCurrency, long? OrigCents, decimal? Rate, string? Error) ResolveFx(
        string groupCurrency, string? origCurrency, decimal? origAmount, decimal? fxRate)
    {
        if (origCurrency is null && origAmount is null && fxRate is null)
            return (0, null, null, null, null); // not used; caller keeps face amount
        if (string.IsNullOrWhiteSpace(origCurrency) || origAmount is null || fxRate is null)
            return (0, null, null, null, "orig_currency, orig_amount and fx_rate are all required together.");
        var cur = origCurrency.Trim().ToUpperInvariant();
        if (!System.Text.RegularExpressions.Regex.IsMatch(cur, "^[A-Z]{3}$"))
            return (0, null, null, null, "orig_currency must be ISO-4217.");
        if (cur == groupCurrency) return (0, null, null, null, "orig_currency must differ from group currency.");
        var (oc, ocErr) = ParseAmount(origAmount.Value);
        if (ocErr is not null) return (0, null, null, null, "orig_" + ocErr.ToLower());
        if (fxRate.Value <= 0) return (0, null, null, null, "fx_rate must be > 0.");
        var converted = Math.Round(origAmount.Value * fxRate.Value, 2, MidpointRounding.AwayFromZero);
        var (cents, cErr) = ParseAmount(converted);
        if (cErr is not null) return (0, null, null, null, cErr);
        return (cents, cur, oc, fxRate.Value, null);
    }

    public static (List<ExpenseGuest> Guests, long TotalCents, string? Error) ResolveGuests(
        List<GuestEntry>? guests, List<Guid> participants)
    {
        if (guests is null || guests.Count == 0) return ([], 0, null);
        if (guests.Count > 20) return ([], 0, "Max 20 guests per expense.");
        var set = participants.ToHashSet();
        var out_ = new List<ExpenseGuest>();
        long total = 0;
        foreach (var g in guests)
        {
            if (string.IsNullOrWhiteSpace(g.Label) || g.Label.Trim().Length > 50)
                return ([], 0, "Guest label 1-50 chars required.");
            if (g.AmountCents <= 0 || g.AmountCents > MaxAmountCents)
                return ([], 0, "Guest amount must be > 0.");
            if (!set.Contains(g.CoveredBy))
                return ([], 0, "Guest covered_by must be a participant.");
            out_.Add(new ExpenseGuest { CoveredByUserId = g.CoveredBy, Label = g.Label.Trim(), ShareCents = g.AmountCents });
            total += g.AmountCents;
        }
        return (out_, total, null);
    }

    /// <summary>Present-only: drop non-payer participants who joined after the spend date.</summary>
    public async Task<(List<Guid> Ids, List<Guid> Dropped)> ApplyPresentOnlyAsync(
        Guid groupId, List<Guid> participantIds, Guid payerId, DateTime spentAt, bool onlyPresent)
    {
        if (!onlyPresent) return (participantIds.Distinct().ToList(), []);
        var joined = await db.GroupMembers.Where(m => m.GroupId == groupId).ToDictionaryAsync(m => m.UserId, m => m.JoinedAt);
        var kept = new List<Guid>();
        var dropped = new List<Guid>();
        foreach (var id in participantIds.Distinct())
        {
            if (id == payerId) { kept.Add(id); continue; }
            if (joined.TryGetValue(id, out var j) && j <= spentAt) kept.Add(id);
            else dropped.Add(id);
        }
        return (kept, dropped);
    }

    public async Task<ExpenseOp> CreateAsync(Guid actorId, Guid groupId, string title, string? description,
        decimal amount, Guid payerId, SplitType splitType, List<Guid> participantIds,
        List<ExactEntry>? exact, List<PercentEntry>? percent, List<ShareEntry>? shares,
        ExpenseOptions? opts = null)
    {
        opts ??= new ExpenseOptions();
        var guard = await GuardAsync(groupId, actorId, null, needWriter: true);
        if (!guard.Ok) return guard;
        var group = ((GuardData)guard.Data!).Group;
        if (string.IsNullOrWhiteSpace(title) || title.Trim().Length > 100)
            return new(false, "VALIDATION", "Title 1-100 chars required.");
        if (description is not null && description.Length > 1000)
            return new(false, "VALIDATION", "Description max 1000 chars.");
        if (await categories.ValidateKeyAsync(groupId, opts.Category) is { } catErr)
            return new(false, "VALIDATION", catErr);
        var (spentAt, spentErr) = ParseSpentAt(opts.SpentAt);
        if (spentErr is not null) return new(false, "VALIDATION", spentErr);
        var (tax, taxErr) = ParseExtra(opts.Tax ?? 0, "tax");
        if (taxErr is not null) return new(false, "VALIDATION", taxErr);
        var (tip, tipErr) = ParseExtra(opts.Tip ?? 0, "tip");
        if (tipErr is not null) return new(false, "VALIDATION", tipErr);
        var (fee, feeErr) = ParseExtra(opts.Fee ?? 0, "fee");
        if (feeErr is not null) return new(false, "VALIDATION", feeErr);
        var (faceCents, amtErr) = ParseAmount(amount);
        if (amtErr is not null) return new(false, "VALIDATION", amtErr);
        // Manual FX overrides the face amount (all-or-nothing triple).
        string? fxCur = null; long? fxOrig = null; decimal? fxRate = null;
        var fxUsed = opts.OrigCurrency is not null || opts.OrigAmount is not null || opts.FxRate is not null;
        if (fxUsed)
        {
            var fx = ResolveFx(group.Currency, opts.OrigCurrency, opts.OrigAmount, opts.FxRate);
            if (fx.Error is not null) return new(false, "VALIDATION", fx.Error);
            faceCents = fx.Cents; fxCur = fx.OrigCurrency; fxOrig = fx.OrigCents; fxRate = fx.Rate;
        }
        if (await MemberAsync(groupId, payerId) is null)
            return new(false, "VALIDATION", "Payer must be an active group member.");
        var (presentIds, _) = await ApplyPresentOnlyAsync(groupId, participantIds, payerId, spentAt, opts.OnlyPresent);
        if (presentIds.Count is 0 or > 50)
            return new(false, "VALIDATION", "1-50 participants required.");
        var frozen = await ArchivedNonMembersAsync(groupId, presentIds.Append(payerId));
        if (frozen.Count > 0)
            return new(false, "INVOLVES_REMOVED_MEMBER", "Re-add removed members first.");
        var current = await db.GroupMembers.Where(m => m.GroupId == groupId).Select(m => m.UserId).ToListAsync();
        if (presentIds.Any(id => !current.Contains(id)))
            return new(false, "VALIDATION", "Participants must be active group members.");
        var (guestRows, guestTotal, guestErr) = ResolveGuests(
            opts.Guests?.Select(g => new GuestEntry(g.Label, g.AmountCents, g.CoveredBy)).ToList(),
            presentIds);
        if (guestErr is not null) return new(false, "VALIDATION", guestErr);
        var baseCents = faceCents + tax + tip + fee;
        var sharesOp = await ResolveShares(splitType, baseCents, presentIds, exact, percent, shares);
        if (!sharesOp.Ok) return sharesOp;
        var map = (Dictionary<Guid, long>)sharesOp.Data!;
        foreach (var gr in guestRows) map[gr.CoveredByUserId] += gr.ShareCents;
        var totalCents = baseCents + guestTotal;

        var before = (await ledger.ComputeNetsAsync(groupId))?.Nets ?? new();
        var e = new Expense
        {
            GroupId = groupId, Title = title.Trim(), Description = description,
            AmountCents = totalCents, PayerId = payerId, SplitType = splitType,
            CreatedBy = actorId,
            Category = (opts.Category ?? "other").Trim().ToLowerInvariant(),
            SpentAt = spentAt, TaxCents = tax, TipCents = tip, FeeCents = fee,
            OrigCurrency = fxCur, OrigAmountCents = fxOrig, FxRate = fxRate,
            Guests = guestRows,
            Splits = map.Select(kv => new ExpenseSplit
            {
                UserId = kv.Key,
                ShareCents = kv.Value,
                ExactCents = exact?.FirstOrDefault(x => x.UserId == kv.Key)?.AmountCents,
                Percent = percent?.FirstOrDefault(x => x.UserId == kv.Key)?.Percent,
                Shares = shares?.FirstOrDefault(x => x.UserId == kv.Key)?.Shares
            }).ToList()
        };
        foreach (var gr in guestRows) gr.ExpenseId = e.Id;
        db.Expenses.Add(e);
        await db.SaveChangesAsync();
        await CheckBudgetAlertAsync(group, e.AmountCents);
        if (notifier is not null)
            await notifier.NotifyExpenseAsync(groupId, actorId, e.Title, totalCents, group.Currency);
        var (plan, _) = await ledger.RecomputeAsync(groupId);
        var after = LedgerService.ApplyDelta(before, null, (payerId, totalCents, map));
        return new(true, null, null, new ExpenseCreated(e, Unsettled(before, after), plan.VersionSeq));
    }

    public async Task<ExpenseOp> PreviewAsync(Guid actorId, Guid groupId, decimal amount,
        SplitType splitType, List<Guid> participantIds,
        List<ExactEntry>? exact, List<PercentEntry>? percent, List<ShareEntry>? shares,
        ExpenseOptions? opts = null)
    {
        opts ??= new ExpenseOptions();
        var guard = await GuardAsync(groupId, actorId, null, needWriter: false);
        if (!guard.Ok) return guard;
        var group = ((GuardData)guard.Data!).Group;
        var (face, amtErr) = ParseAmount(amount);
        if (amtErr is not null) return new(false, "VALIDATION", amtErr);
        var (tax, taxErr) = ParseExtra(opts.Tax ?? 0, "tax");
        if (taxErr is not null) return new(false, "VALIDATION", taxErr);
        var (tip, tipErr) = ParseExtra(opts.Tip ?? 0, "tip");
        if (tipErr is not null) return new(false, "VALIDATION", tipErr);
        var (fee, feeErr) = ParseExtra(opts.Fee ?? 0, "fee");
        if (feeErr is not null) return new(false, "VALIDATION", feeErr);
        if (opts.OrigCurrency is not null || opts.OrigAmount is not null || opts.FxRate is not null)
        {
            var fx = ResolveFx(group.Currency, opts.OrigCurrency, opts.OrigAmount, opts.FxRate);
            if (fx.Error is not null) return new(false, "VALIDATION", fx.Error);
            face = fx.Cents;
        }
        var (spentAt, spentErr) = ParseSpentAt(opts.SpentAt);
        if (spentErr is not null) return new(false, "VALIDATION", spentErr);
        // Preview runs as the payer for present-only purposes; payer exemption is irrelevant here.
        var (presentIds, _) = await ApplyPresentOnlyAsync(groupId, participantIds, Guid.Empty, spentAt, opts.OnlyPresent);
        var (guestRows, _, guestErr) = ResolveGuests(
            opts.Guests?.Select(g => new GuestEntry(g.Label, g.AmountCents, g.CoveredBy)).ToList(), presentIds);
        if (guestErr is not null) return new(false, "VALIDATION", guestErr);
        var sharesOp = await ResolveShares(splitType, face + tax + tip + fee, presentIds, exact, percent, shares);
        if (!sharesOp.Ok) return sharesOp;
        var map = (Dictionary<Guid, long>)sharesOp.Data!;
        foreach (var gr in guestRows) map[gr.CoveredByUserId] += gr.ShareCents;
        return new(true, null, null, new ExpensePreview(map));
    }

    public async Task<ExpenseOp> UpdateAsync(Guid actorId, Guid expenseId, int expectedVersion,
        string? title, string? description, decimal? amount, Guid? payerId, SplitType? splitType,
        List<Guid>? participantIds, List<ExactEntry>? exact, List<PercentEntry>? percent, List<ShareEntry>? shares,
        ExpenseOptions? opts = null)
    {
        opts ??= new ExpenseOptions();
        var e = await db.Expenses.Include(x => x.Splits).Include(x => x.Guests).FirstOrDefaultAsync(x => x.Id == expenseId && x.DeletedAt == null);
        if (e is null) return new(false, "NOT_FOUND", "Expense not found.");
        var guard = await GuardAsync(e.GroupId, actorId, expenseId, needWriter: true);
        if (!guard.Ok) return guard;
        var group = ((GuardData)guard.Data!).Group;
        e = ((GuardData)guard.Data!).Expense!;
        if (e.Version != expectedVersion)
            return new(false, "STALE_VERSION", $"Current version is {e.Version}; reload and retry.");

        var newTitle = title?.Trim() ?? e.Title;
        if (newTitle.Length is 0 or > 100) return new(false, "VALIDATION", "Title 1-100 chars required.");
        if (description is not null && description.Length > 1000)
            return new(false, "VALIDATION", "Description max 1000 chars.");
        if (await categories.ValidateKeyAsync(e.GroupId, opts.Category) is { } catErr)
            return new(false, "VALIDATION", catErr);
        var newCategory = opts.Category is null ? e.Category : opts.Category.Trim().ToLowerInvariant();
        var newSpentAt = e.SpentAt;
        if (opts.SpentAt is not null)
        {
            var (sp, spErr) = ParseSpentAt(opts.SpentAt);
            if (spErr is not null) return new(false, "VALIDATION", spErr);
            newSpentAt = sp;
        }
        var moneyTouched = amount is not null || opts.Tax is not null || opts.Tip is not null
            || opts.Fee is not null || opts.OrigCurrency is not null || opts.OrigAmount is not null
            || opts.FxRate is not null || opts.Guests is not null || opts.OnlyPresent
            || opts.SpentAt is not null;
        var newTax = e.TaxCents; var newTip = e.TipCents; var newFee = e.FeeCents;
        if (opts.Tax is not null) { var (v, er) = ParseExtra(opts.Tax.Value, "tax"); if (er is not null) return new(false, "VALIDATION", er); newTax = v; }
        if (opts.Tip is not null) { var (v, er) = ParseExtra(opts.Tip.Value, "tip"); if (er is not null) return new(false, "VALIDATION", er); newTip = v; }
        if (opts.Fee is not null) { var (v, er) = ParseExtra(opts.Fee.Value, "fee"); if (er is not null) return new(false, "VALIDATION", er); newFee = v; }
        var newFace = e.AmountCents - e.TaxCents - e.TipCents - e.FeeCents - e.Guests.Sum(g => g.ShareCents);
        if (amount is not null)
        {
            var (c, err) = ParseAmount(amount.Value);
            if (err is not null) return new(false, "VALIDATION", err);
            newFace = c;
        }
        var newFxCur = e.OrigCurrency; long? newFxOrig = e.OrigAmountCents; decimal? newFxRate = e.FxRate;
        var fxTouched = opts.OrigCurrency is not null || opts.OrigAmount is not null || opts.FxRate is not null;
        if (fxTouched)
        {
            var fx = ResolveFx(group.Currency, opts.OrigCurrency, opts.OrigAmount, opts.FxRate);
            if (fx.Error is not null) return new(false, "VALIDATION", fx.Error);
            newFace = fx.Cents; newFxCur = fx.OrigCurrency; newFxOrig = fx.OrigCents; newFxRate = fx.Rate;
        }
        var newPayer = payerId ?? e.PayerId;
        if (await MemberAsync(e.GroupId, newPayer) is null)
            return new(false, "VALIDATION", "Payer must be an active group member.");
        var newType = splitType ?? e.SplitType;
        var rawParts = participantIds ?? e.Splits.Select(s => s.UserId).ToList();
        var (presentIds, _) = await ApplyPresentOnlyAsync(e.GroupId, rawParts, newPayer, newSpentAt, opts.OnlyPresent);
        var newParts = presentIds;
        var frozen = await ArchivedNonMembersAsync(e.GroupId, newParts.Append(newPayer));
        if (frozen.Count > 0)
            return new(false, "INVOLVES_REMOVED_MEMBER", "Re-add removed members first.");
        var current = await db.GroupMembers.Where(m => m.GroupId == e.GroupId).Select(m => m.UserId).ToListAsync();
        if (newParts.Any(id => !current.Contains(id)))
            return new(false, "VALIDATION", "Participants must be active group members.");
        if (newParts.Count is 0 or > 50)
            return new(false, "VALIDATION", "1-50 participants required.");
        var newBase = newFace + newTax + newTip + newFee;
        var sharesOp = await ResolveShares(newType, newBase, newParts, exact, percent, shares);
        var splitTouched = participantIds is not null || splitType is not null
            || exact is not null || percent is not null || shares is not null;
        Dictionary<Guid, long> map;
        long newTotal = e.AmountCents;
        List<ExpenseGuest> finalGuests = e.Guests.ToList();
        if (!moneyTouched && !splitTouched)
        {
            // Metadata-only edit: keep existing shares (avoids spurious diffs).
            map = e.Splits.ToDictionary(s => s.UserId, s => s.ShareCents);
        }
        else
        {
            if (!sharesOp.Ok) return sharesOp;
            map = (Dictionary<Guid, long>)sharesOp.Data!;
            var guestInput = opts.Guests?.Select(g => new GuestEntry(g.Label, g.AmountCents, g.CoveredBy)).ToList()
                ?? e.Guests.Select(g => new GuestEntry(g.Label, g.ShareCents, g.CoveredByUserId)).ToList();
            var (rows, total, gErr) = ResolveGuests(guestInput, newParts);
            if (gErr is not null) return new(false, "VALIDATION", gErr);
            foreach (var gr in rows)
            {
                map[gr.CoveredByUserId] += gr.ShareCents;
                gr.ExpenseId = e.Id;
            }
            finalGuests = rows;
            newTotal = newBase + total;
        }

        var before = (await ledger.ComputeNetsAsync(e.GroupId))?.Nets ?? new();
        var diff = new Dictionary<string, object>();
        if (newTitle != e.Title) diff["title"] = new { from = e.Title, to = newTitle };
        if ((description ?? e.Description) != e.Description) diff["description"] = new { from = e.Description, to = description };
        if (newTotal != e.AmountCents) diff["amount_cents"] = new { from = e.AmountCents, to = newTotal };
        if (newCategory != e.Category) diff["category"] = new { from = e.Category, to = newCategory };
        if (newPayer != e.PayerId) diff["payer"] = new { from = e.PayerId, to = newPayer };
        var oldMap = e.Splits.ToDictionary(s => s.UserId, s => s.ShareCents);
        if (!oldMap.OrderBy(kv => kv.Key).SequenceEqual(map.OrderBy(kv => kv.Key)))
            diff["splits"] = new { from = oldMap, to = map };

        var oldState = (e.PayerId, e.AmountCents, oldMap);
        e.Title = newTitle;
        if (description is not null) e.Description = description;
        e.AmountCents = newTotal;
        e.PayerId = newPayer;
        e.SplitType = newType;
        e.Category = newCategory;
        e.SpentAt = newSpentAt;
        e.TaxCents = newTax; e.TipCents = newTip; e.FeeCents = newFee;
        e.OrigCurrency = newFxCur; e.OrigAmountCents = newFxOrig; e.FxRate = newFxRate;
        e.UpdatedAt = DateTime.UtcNow;
        e.Version++;
        db.ExpenseSplits.RemoveRange(e.Splits);
        db.ExpenseGuests.RemoveRange(db.ExpenseGuests.Where(g => g.ExpenseId == e.Id));
        var oldSplits = e.Splits.ToList(); // snapshot: RemoveRange only marks deleted, reassignment below would alias
        e.Splits = map.Select(kv => new ExpenseSplit
        {
            ExpenseId = e.Id,
            UserId = kv.Key,
            ShareCents = kv.Value,
            ExactCents = exact?.FirstOrDefault(x => x.UserId == kv.Key)?.AmountCents
                ?? oldSplits.FirstOrDefault(s => s.UserId == kv.Key)?.ExactCents,
            Percent = percent?.FirstOrDefault(x => x.UserId == kv.Key)?.Percent
                ?? oldSplits.FirstOrDefault(s => s.UserId == kv.Key)?.Percent,
            Shares = shares?.FirstOrDefault(x => x.UserId == kv.Key)?.Shares
                ?? oldSplits.FirstOrDefault(s => s.UserId == kv.Key)?.Shares
        }).ToList();
        e.Guests = finalGuests;
        db.ExpenseAudits.Add(new ExpenseAudit
        {
            ExpenseId = e.Id, ActorId = actorId, DiffJson = JsonSerializer.Serialize(diff)
        });
        await db.SaveChangesAsync();
        var (plan, _) = await ledger.RecomputeAsync(e.GroupId);
        var after = LedgerService.ApplyDelta(before, oldState, (newPayer, newTotal, map));
        return new(true, null, null, new ExpenseUpdated(e, Unsettled(before, after), plan.VersionSeq));
    }

    public async Task<ExpenseOp> PreviewEditAsync(Guid actorId, Guid expenseId,
        decimal? amount, Guid? payerId, SplitType? splitType, List<Guid>? participantIds,
        List<ExactEntry>? exact, List<PercentEntry>? percent, List<ShareEntry>? shares,
        ExpenseOptions? opts = null)
    {
        opts ??= new ExpenseOptions();
        var e = await db.Expenses.Include(x => x.Splits).Include(x => x.Guests).FirstOrDefaultAsync(x => x.Id == expenseId && x.DeletedAt == null);
        if (e is null) return new(false, "NOT_FOUND", "Expense not found.");
        var guard = await GuardAsync(e.GroupId, actorId, expenseId, needWriter: true);
        if (!guard.Ok) return guard;
        var group = ((GuardData)guard.Data!).Group;
        e = ((GuardData)guard.Data!).Expense!;
        var oldFace = e.AmountCents - e.TaxCents - e.TipCents - e.FeeCents - e.Guests.Sum(g => g.ShareCents);
        var newFace = oldFace;
        if (amount is not null)
        {
            var (c, err) = ParseAmount(amount.Value);
            if (err is not null) return new(false, "VALIDATION", err);
            newFace = c;
        }
        var newTax = e.TaxCents; var newTip = e.TipCents; var newFee = e.FeeCents;
        if (opts.Tax is not null) { var (v, er) = ParseExtra(opts.Tax.Value, "tax"); if (er is not null) return new(false, "VALIDATION", er); newTax = v; }
        if (opts.Tip is not null) { var (v, er) = ParseExtra(opts.Tip.Value, "tip"); if (er is not null) return new(false, "VALIDATION", er); newTip = v; }
        if (opts.Fee is not null) { var (v, er) = ParseExtra(opts.Fee.Value, "fee"); if (er is not null) return new(false, "VALIDATION", er); newFee = v; }
        if (opts.OrigCurrency is not null || opts.OrigAmount is not null || opts.FxRate is not null)
        {
            var fx = ResolveFx(group.Currency, opts.OrigCurrency, opts.OrigAmount, opts.FxRate);
            if (fx.Error is not null) return new(false, "VALIDATION", fx.Error);
            newFace = fx.Cents;
        }
        var newSpentAt = e.SpentAt;
        if (opts.SpentAt is not null)
        {
            var (sp, spErr) = ParseSpentAt(opts.SpentAt);
            if (spErr is not null) return new(false, "VALIDATION", spErr);
            newSpentAt = sp;
        }
        var newPayer = payerId ?? e.PayerId;
        var newType = splitType ?? e.SplitType;
        var rawParts = participantIds ?? e.Splits.Select(s => s.UserId).ToList();
        var (presentIds, _) = await ApplyPresentOnlyAsync(e.GroupId, rawParts, newPayer, newSpentAt, opts.OnlyPresent);
        var newBase = newFace + newTax + newTip + newFee;
        var sharesOp = await ResolveShares(newType, newBase, presentIds, exact, percent, shares);
        Dictionary<Guid, long> map;
        long previewTotal = e.AmountCents;
        if (sharesOp.Ok)
        {
            map = (Dictionary<Guid, long>)sharesOp.Data!;
            var guestInput = opts.Guests?.Select(g => new GuestEntry(g.Label, g.AmountCents, g.CoveredBy)).ToList()
                ?? e.Guests.Select(g => new GuestEntry(g.Label, g.ShareCents, g.CoveredByUserId)).ToList();
            var (rows, gTotal, gErr) = ResolveGuests(guestInput, presentIds);
            if (gErr is not null) return new(false, "VALIDATION", gErr);
            foreach (var gr in rows) map[gr.CoveredByUserId] += gr.ShareCents;
            previewTotal = newBase + gTotal;
        }
        else if (participantIds is null && splitType is null && amount is null
            && opts.Tax is null && opts.Tip is null && opts.Fee is null && opts.Guests is null)
            map = e.Splits.ToDictionary(s => s.UserId, s => s.ShareCents);
        else return sharesOp;

        var before = (await ledger.ComputeNetsAsync(e.GroupId))?.Nets ?? new();
        var after = LedgerService.ApplyDelta(before,
            (e.PayerId, e.AmountCents, e.Splits.ToDictionary(s => s.UserId, s => s.ShareCents)),
            (newPayer, previewTotal, map));
        return new(true, null, null, new EditPreview(map, Unsettled(before, after)));
    }

    public async Task<ExpenseOp> DeleteAsync(Guid actorId, Guid expenseId)
    {
        var e = await db.Expenses.Include(x => x.Splits).FirstOrDefaultAsync(x => x.Id == expenseId && x.DeletedAt == null);
        if (e is null) return new(false, "NOT_FOUND", "Expense not found.");
        var guard = await GuardAsync(e.GroupId, actorId, expenseId, needWriter: true);
        if (!guard.Ok) return guard;
        e = ((GuardData)guard.Data!).Expense!;
        var before = (await ledger.ComputeNetsAsync(e.GroupId))?.Nets ?? new();
        var oldState = (e.PayerId, e.AmountCents, e.Splits.ToDictionary(s => s.UserId, s => s.ShareCents));
        e.DeletedAt = DateTime.UtcNow;
        db.ExpenseAudits.Add(new ExpenseAudit
        {
            ExpenseId = e.Id, ActorId = actorId,
            DiffJson = JsonSerializer.Serialize(new { deleted = true, title = e.Title })
        });
        await db.SaveChangesAsync();
        var (plan, _) = await ledger.RecomputeAsync(e.GroupId);
        var after = LedgerService.ApplyDelta(before, oldState, null);
        return new(true, null, null, new ExpenseDeleted(Unsettled(before, after), plan.VersionSeq));
    }

    private static List<Guid> Unsettled(Dictionary<Guid, long> before, Dictionary<Guid, long> after)
        => before.Where(kv => kv.Value == 0 && after.TryGetValue(kv.Key, out var v) && v != 0)
            .Select(kv => kv.Key).OrderBy(id => id).ToList();

    /// <summary>Budget alert: email owners once when a new expense pushes spend across the threshold.</summary>
    public async Task CheckBudgetAlertAsync(Group group, long newExpenseCents)
    {
        if (email is null || group.BudgetCents is not { } budget || budget <= 0) return;
        var spent = await db.Expenses.Where(e => e.GroupId == group.Id && e.DeletedAt == null)
            .SumAsync(e => e.AmountCents);
        var threshold = budget * group.BudgetAlertPct / 100;
        if (spent >= threshold && spent - newExpenseCents < threshold)
        {
            var ownerIds = await db.GroupMembers.Where(m => m.GroupId == group.Id && m.Role == "owner")
                .Select(m => m.UserId).ToListAsync();
            var addresses = await db.Users.Where(u => ownerIds.Contains(u.Id)).Select(u => u.Email).ToListAsync();
            foreach (var addr in addresses)
            {
                try { await email.SendAsync(addr, $"Budget alert: {group.Name}", $"Spend is {(spent / 100m):0.00} of {(budget / 100m):0.00} {group.Currency} ({group.BudgetAlertPct}% threshold)."); }
                catch { /* alert mail must not fail the expense */ }
            }
        }
    }

    public async Task<ExpenseOp> UploadImageAsync(Guid actorId, Guid expenseId, string fileName, string mime, byte[] bytes)
    {
        var e = await db.Expenses.FirstOrDefaultAsync(x => x.Id == expenseId && x.DeletedAt == null);
        if (e is null) return new(false, "NOT_FOUND", "Expense not found.");
        var guard = await GuardAsync(e.GroupId, actorId, expenseId, needWriter: true);
        if (!guard.Ok) return guard;
        var norm = NormalizeImageMime(fileName, mime);
        if (!AllowedMimes.Contains(norm)) return new(false, "VALIDATION", $"Allowed: jpg png webp heic (got '{mime}').");
        if (bytes.Length == 0 || bytes.Length > MaxImageBytes)
            return new(false, "VALIDATION", $"Image must be 1B-10MB (got {bytes.Length}B).");
        var count = await db.ExpenseImages.CountAsync(i => i.ExpenseId == expenseId);
        if (count >= MaxImages) return new(false, "VALIDATION", $"Max {MaxImages} images per expense.");
        var clean = ImageSanitizer.Sanitize(bytes, norm);
        var key = await files.SaveAsync(expenseId, fileName, norm, new MemoryStream(clean));
        var img = new ExpenseImage
        {
            ExpenseId = expenseId, StorageKey = key, Mime = norm,
            SizeBytes = clean.Length, UploadedBy = actorId
        };
        db.ExpenseImages.Add(img);
        await db.SaveChangesAsync();
        return new(true, null, null, img);
    }

    public async Task<ExpenseOp> DeleteImageAsync(Guid actorId, Guid imageId)
    {
        var img = await db.ExpenseImages.FindAsync(imageId);
        if (img is null) return new(false, "NOT_FOUND", "Image not found.");
        var e = await db.Expenses.FirstOrDefaultAsync(x => x.Id == img.ExpenseId && x.DeletedAt == null);
        if (e is null) return new(false, "NOT_FOUND", "Expense not found.");
        var guard = await GuardAsync(e.GroupId, actorId, e.Id, needWriter: true);
        if (!guard.Ok) return guard;
        await files.DeleteAsync(img.StorageKey);
        db.ExpenseImages.Remove(img);
        await db.SaveChangesAsync();
        return new(true, null, null, new StatusResult("deleted"));
    }

    public async Task<ExpenseOp> GetDetailAsync(Guid requesterId, Guid expenseId)
    {
        var e = await db.Expenses.Include(x => x.Splits).Include(x => x.Images).Include(x => x.Guests)
            .FirstOrDefaultAsync(x => x.Id == expenseId && x.DeletedAt == null);
        if (e is null) return new(false, "NOT_FOUND", "Expense not found.");
        var member = await MemberAsync(e.GroupId, requesterId);
        var archived = await db.MembershipArchives.FindAsync(e.GroupId, requesterId);
        if (member is null && archived is null) return new(false, "FORBIDDEN", "Not a group member.");
        var audits = await db.ExpenseAudits.Where(a => a.ExpenseId == expenseId)
            .OrderBy(a => a.CreatedAt).ToListAsync();
        var planVersion = await db.SettlementPlans.Where(s => s.GroupId == e.GroupId)
            .Select(s => (int?)s.VersionSeq).MaxAsync() ?? 0;
        return new(true, null, null, new
        {
            expense = MapExpense(e),
            audit = audits.Select(a => new { actor_id = a.ActorId, diff = JsonSerializer.Deserialize<object>(a.DiffJson), at = a.CreatedAt }),
            settlement_version = planVersion
        });
    }

    public static object MapExpense(Expense e) => new
    {
        expense_id = e.Id,
        group_id = e.GroupId,
        title = e.Title,
        description = e.Description,
        amount_cents = e.AmountCents,
        payer_id = e.PayerId,
        split_type = e.SplitType.ToString().ToUpperInvariant(),
        status = e.Status.ToString().ToUpperInvariant(),
        created_by = e.CreatedBy,
        created_at = e.CreatedAt,
        updated_at = e.UpdatedAt,
        version = e.Version,
        category = e.Category,
        spent_at = e.SpentAt,
        tax_cents = e.TaxCents,
        tip_cents = e.TipCents,
        fee_cents = e.FeeCents,
        orig_currency = e.OrigCurrency,
        orig_amount_cents = e.OrigAmountCents,
        fx_rate = e.FxRate,
        guests = e.Guests.Select(g => new { guest_id = g.Id, label = g.Label, share_cents = g.ShareCents, covered_by = g.CoveredByUserId }),
        splits = e.Splits.Select(s => new { user_id = s.UserId, share_cents = s.ShareCents, exact_cents = s.ExactCents, percent = s.Percent, shares = s.Shares }),
        images = e.Images.Select(i => new { image_id = i.Id, mime = i.Mime, size_bytes = i.SizeBytes })
    };

    public async Task<(Expense Expense, string Key, string Mime)?> OpenImageAsync(Guid requesterId, Guid imageId)
    {
        var img = await db.ExpenseImages.FindAsync(imageId);
        if (img is null) return null;
        var e = await db.Expenses.FirstOrDefaultAsync(x => x.Id == img.ExpenseId);
        if (e is null) return null;
        var member = await MemberAsync(e.GroupId, requesterId);
        var archived = await db.MembershipArchives.FindAsync(e.GroupId, requesterId);
        if (member is null && archived is null) return null;
        return (e, img.StorageKey, img.Mime);
    }
}
