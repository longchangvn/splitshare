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

public sealed class ExpenseService(AppDbContext db, LedgerService ledger, IFileStore files)
{
    public const long MaxAmountCents = 100_000_000; // 1,000,000.00
    public const long MaxImageBytes = 10 * 1024 * 1024;
    public const int MaxImages = 5;
    public static readonly HashSet<string> AllowedMimes = new(StringComparer.OrdinalIgnoreCase)
        { "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic" };

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
        Expense? e = null;
        if (expenseId is not null)
        {
            e = await db.Expenses.Include(x => x.Splits).Include(x => x.Images)
                .FirstOrDefaultAsync(x => x.Id == expenseId && x.GroupId == groupId && x.DeletedAt == null);
            if (e is null) return new(false, "NOT_FOUND", "Expense not found.");
            if (e.Status != ExpenseStatus.Open) return new(false, "EXPENSE_LOCKED", "Settled expense is locked.");
            if (needWriter && e.CreatedBy != actorId && role != "owner")
                return new(false, "FORBIDDEN", "Only the creator or an owner can modify.");
        }
        return new(true, null, null, new GuardData(g, role, e));
    }
    private sealed record GuardData(Group Group, string Role, Expense? Expense);

    public async Task<ExpenseOp> CreateAsync(Guid actorId, Guid groupId, string title, string? description,
        decimal amount, Guid payerId, SplitType splitType, List<Guid> participantIds,
        List<ExactEntry>? exact, List<PercentEntry>? percent, List<ShareEntry>? shares)
    {
        var guard = await GuardAsync(groupId, actorId, null, needWriter: false);
        if (!guard.Ok) return guard;
        if (string.IsNullOrWhiteSpace(title) || title.Trim().Length > 100)
            return new(false, "VALIDATION", "Title 1-100 chars required.");
        if (description is not null && description.Length > 1000)
            return new(false, "VALIDATION", "Description max 1000 chars.");
        var (cents, amtErr) = ParseAmount(amount);
        if (amtErr is not null) return new(false, "VALIDATION", amtErr);
        if (await MemberAsync(groupId, payerId) is null)
            return new(false, "VALIDATION", "Payer must be an active group member.");
        var frozen = await ArchivedNonMembersAsync(groupId, participantIds.Append(payerId));
        if (frozen.Count > 0)
            return new(false, "INVOLVES_REMOVED_MEMBER", "Re-add removed members first.");
        var current = await db.GroupMembers.Where(m => m.GroupId == groupId).Select(m => m.UserId).ToListAsync();
        if (participantIds.Any(id => !current.Contains(id)))
            return new(false, "VALIDATION", "Participants must be active group members.");
        var sharesOp = await ResolveShares(splitType, cents, participantIds, exact, percent, shares);
        if (!sharesOp.Ok) return sharesOp;
        var map = (Dictionary<Guid, long>)sharesOp.Data!;

        var before = (await ledger.ComputeNetsAsync(groupId))?.Nets ?? new();
        var e = new Expense
        {
            GroupId = groupId, Title = title.Trim(), Description = description,
            AmountCents = cents, PayerId = payerId, SplitType = splitType,
            CreatedBy = actorId,
            Splits = map.Select(kv => new ExpenseSplit { UserId = kv.Key, ShareCents = kv.Value }).ToList()
        };
        db.Expenses.Add(e);
        await db.SaveChangesAsync();
        var (plan, _) = await ledger.RecomputeAsync(groupId);
        var after = LedgerService.ApplyDelta(before, null, (payerId, cents, map));
        return new(true, null, null, new ExpenseCreated(e, Unsettled(before, after), plan.VersionSeq));
    }

    public async Task<ExpenseOp> PreviewAsync(Guid actorId, Guid groupId, decimal amount,
        SplitType splitType, List<Guid> participantIds,
        List<ExactEntry>? exact, List<PercentEntry>? percent, List<ShareEntry>? shares)
    {
        var guard = await GuardAsync(groupId, actorId, null, needWriter: false);
        if (!guard.Ok) return guard;
        var (cents, amtErr) = ParseAmount(amount);
        if (amtErr is not null) return new(false, "VALIDATION", amtErr);
        var sharesOp = await ResolveShares(splitType, cents, participantIds, exact, percent, shares);
        return !sharesOp.Ok ? sharesOp : new(true, null, null, new ExpensePreview((Dictionary<Guid, long>)sharesOp.Data!));
    }

    public async Task<ExpenseOp> UpdateAsync(Guid actorId, Guid expenseId, int expectedVersion,
        string? title, string? description, decimal? amount, Guid? payerId, SplitType? splitType,
        List<Guid>? participantIds, List<ExactEntry>? exact, List<PercentEntry>? percent, List<ShareEntry>? shares)
    {
        var e = await db.Expenses.Include(x => x.Splits).FirstOrDefaultAsync(x => x.Id == expenseId && x.DeletedAt == null);
        if (e is null) return new(false, "NOT_FOUND", "Expense not found.");
        var guard = await GuardAsync(e.GroupId, actorId, expenseId, needWriter: true);
        if (!guard.Ok) return guard;
        e = ((GuardData)guard.Data!).Expense!;
        if (e.Version != expectedVersion)
            return new(false, "STALE_VERSION", $"Current version is {e.Version}; reload and retry.");

        var newTitle = title?.Trim() ?? e.Title;
        if (newTitle.Length is 0 or > 100) return new(false, "VALIDATION", "Title 1-100 chars required.");
        if (description is not null && description.Length > 1000)
            return new(false, "VALIDATION", "Description max 1000 chars.");
        var newCents = e.AmountCents;
        if (amount is not null)
        {
            var (c, err) = ParseAmount(amount.Value);
            if (err is not null) return new(false, "VALIDATION", err);
            newCents = c;
        }
        var newPayer = payerId ?? e.PayerId;
        if (await MemberAsync(e.GroupId, newPayer) is null)
            return new(false, "VALIDATION", "Payer must be an active group member.");
        var newType = splitType ?? e.SplitType;
        var newParts = participantIds ?? e.Splits.Select(s => s.UserId).ToList();
        var frozen = await ArchivedNonMembersAsync(e.GroupId, newParts.Append(newPayer));
        if (frozen.Count > 0)
            return new(false, "INVOLVES_REMOVED_MEMBER", "Re-add removed members first.");
        var current = await db.GroupMembers.Where(m => m.GroupId == e.GroupId).Select(m => m.UserId).ToListAsync();
        if (newParts.Any(id => !current.Contains(id)))
            return new(false, "VALIDATION", "Participants must be active group members.");
        var sharesOp = await ResolveShares(newType, newCents, newParts, exact, percent, shares);
        if (!sharesOp.Ok && (participantIds is not null || splitType is not null || amount is not null || exact is not null || percent is not null || shares is not null))
            return sharesOp;
        var map = sharesOp.Ok ? (Dictionary<Guid, long>)sharesOp.Data!
            : e.Splits.ToDictionary(s => s.UserId, s => s.ShareCents);
        // If split inputs unchanged, keep existing shares (avoids spurious diffs).
        if (participantIds is null && splitType is null && amount is null && exact is null && percent is null && shares is null)
            map = e.Splits.ToDictionary(s => s.UserId, s => s.ShareCents);

        var before = (await ledger.ComputeNetsAsync(e.GroupId))?.Nets ?? new();
        var diff = new Dictionary<string, object>();
        if (newTitle != e.Title) diff["title"] = new { from = e.Title, to = newTitle };
        if ((description ?? e.Description) != e.Description) diff["description"] = new { from = e.Description, to = description };
        if (newCents != e.AmountCents) diff["amount_cents"] = new { from = e.AmountCents, to = newCents };
        if (newPayer != e.PayerId) diff["payer"] = new { from = e.PayerId, to = newPayer };
        var oldMap = e.Splits.ToDictionary(s => s.UserId, s => s.ShareCents);
        if (!oldMap.OrderBy(kv => kv.Key).SequenceEqual(map.OrderBy(kv => kv.Key)))
            diff["splits"] = new { from = oldMap, to = map };

        var oldState = (e.PayerId, e.AmountCents, oldMap);
        e.Title = newTitle;
        if (description is not null) e.Description = description;
        e.AmountCents = newCents;
        e.PayerId = newPayer;
        e.SplitType = newType;
        e.UpdatedAt = DateTime.UtcNow;
        e.Version++;
        db.ExpenseSplits.RemoveRange(e.Splits);
        e.Splits = map.Select(kv => new ExpenseSplit { ExpenseId = e.Id, UserId = kv.Key, ShareCents = kv.Value }).ToList();
        db.ExpenseAudits.Add(new ExpenseAudit
        {
            ExpenseId = e.Id, ActorId = actorId, DiffJson = JsonSerializer.Serialize(diff)
        });
        await db.SaveChangesAsync();
        var (plan, _) = await ledger.RecomputeAsync(e.GroupId);
        var after = LedgerService.ApplyDelta(before, oldState, (newPayer, newCents, map));
        return new(true, null, null, new ExpenseUpdated(e, Unsettled(before, after), plan.VersionSeq));
    }

    public async Task<ExpenseOp> PreviewEditAsync(Guid actorId, Guid expenseId,
        decimal? amount, Guid? payerId, SplitType? splitType, List<Guid>? participantIds,
        List<ExactEntry>? exact, List<PercentEntry>? percent, List<ShareEntry>? shares)
    {
        var e = await db.Expenses.Include(x => x.Splits).FirstOrDefaultAsync(x => x.Id == expenseId && x.DeletedAt == null);
        if (e is null) return new(false, "NOT_FOUND", "Expense not found.");
        var guard = await GuardAsync(e.GroupId, actorId, expenseId, needWriter: true);
        if (!guard.Ok) return guard;
        e = ((GuardData)guard.Data!).Expense!;
        var newCents = e.AmountCents;
        if (amount is not null)
        {
            var (c, err) = ParseAmount(amount.Value);
            if (err is not null) return new(false, "VALIDATION", err);
            newCents = c;
        }
        var newPayer = payerId ?? e.PayerId;
        var newType = splitType ?? e.SplitType;
        var newParts = participantIds ?? e.Splits.Select(s => s.UserId).ToList();
        var sharesOp = await ResolveShares(newType, newCents, newParts, exact, percent, shares);
        Dictionary<Guid, long> map;
        if (sharesOp.Ok) map = (Dictionary<Guid, long>)sharesOp.Data!;
        else if (participantIds is null && splitType is null && amount is null)
            map = e.Splits.ToDictionary(s => s.UserId, s => s.ShareCents);
        else return sharesOp;

        var before = (await ledger.ComputeNetsAsync(e.GroupId))?.Nets ?? new();
        var after = LedgerService.ApplyDelta(before,
            (e.PayerId, e.AmountCents, e.Splits.ToDictionary(s => s.UserId, s => s.ShareCents)),
            (newPayer, newCents, map));
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

    public async Task<ExpenseOp> UploadImageAsync(Guid actorId, Guid expenseId, string fileName, string mime, byte[] bytes)
    {
        var e = await db.Expenses.FirstOrDefaultAsync(x => x.Id == expenseId && x.DeletedAt == null);
        if (e is null) return new(false, "NOT_FOUND", "Expense not found.");
        var guard = await GuardAsync(e.GroupId, actorId, expenseId, needWriter: true);
        if (!guard.Ok) return guard;
        if (!AllowedMimes.Contains(mime)) return new(false, "VALIDATION", "Allowed: jpg png webp heic.");
        if (bytes.Length == 0 || bytes.Length > MaxImageBytes)
            return new(false, "VALIDATION", $"Image must be 1B-10MB (got {bytes.Length}B).");
        var count = await db.ExpenseImages.CountAsync(i => i.ExpenseId == expenseId);
        if (count >= MaxImages) return new(false, "VALIDATION", $"Max {MaxImages} images per expense.");
        var clean = ImageSanitizer.Sanitize(bytes, mime);
        var key = await files.SaveAsync(expenseId, fileName, mime, new MemoryStream(clean));
        var img = new ExpenseImage
        {
            ExpenseId = expenseId, StorageKey = key, Mime = mime,
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
        var e = await db.Expenses.Include(x => x.Splits).Include(x => x.Images)
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
        splits = e.Splits.Select(s => new { user_id = s.UserId, share_cents = s.ShareCents }),
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
