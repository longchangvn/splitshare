using Microsoft.EntityFrameworkCore;
using SplitShare.Api.Data;

namespace SplitShare.Api.Services;

/// <summary>One activity entry; <c>Ref</c> is the expense/payment id when one exists.</summary>
public sealed record ActivityRow(string Kind, DateTime At, string Text, Guid? Ref);

/// <summary>Activity entry annotated with the group it came from (cross-group feed).</summary>
public sealed record UserActivityRow(
    string Kind, DateTime At, string Text, Guid? Ref, Guid GroupId, string GroupName);

/// <summary>
/// Activity feed builder shared by <c>GET /groups/{id}/activity</c> and
/// <c>GET /me/activity</c>. Visibility is the caller's responsibility: the group
/// endpoint checks membership first, the account endpoint only iterates the
/// caller's own groups. <c>before</c> is an exclusive timestamp cursor.
/// </summary>
public sealed class ActivityService(AppDbContext db)
{
    public async Task<Dictionary<Guid, string>> NamesAsync(Guid groupId)
    {
        var ids = await db.GroupMembers.Where(m => m.GroupId == groupId)
            .Select(m => m.UserId).ToListAsync();
        var archived = await db.MembershipArchives.Where(a => a.GroupId == groupId)
            .Select(a => a.UserId).ToListAsync();
        var all = ids.Concat(archived).Distinct().ToList();
        return await db.Users.Where(u => all.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.DisplayName);
    }

    /// <summary>Newest-first feed for one group; at most <paramref name="take"/> rows.</summary>
    public async Task<List<ActivityRow>> GroupFeedAsync(Guid groupId, int take, DateTime? before = null)
    {
        var names = await NamesAsync(groupId);
        string N(Guid u) => names.TryGetValue(u, out var n) ? n : "Unknown";
        var cutoff = before ?? DateTime.MaxValue;

        var feed = new List<ActivityRow>();
        foreach (var e in await db.Expenses
                     .Where(e => e.GroupId == groupId && e.DeletedAt == null && e.CreatedAt < cutoff)
                     .OrderByDescending(e => e.CreatedAt).Take(take).ToListAsync())
            feed.Add(new("expense", e.CreatedAt, $"{N(e.CreatedBy)} added “{e.Title}”", e.Id));

        foreach (var pay in await db.Payments
                     .Where(x => x.GroupId == groupId && x.CreatedAt < cutoff)
                     .OrderByDescending(x => x.CreatedAt).Take(take).ToListAsync())
            feed.Add(new("payment", pay.CreatedAt,
                $"{N(pay.FromUserId)} paid {N(pay.ToUserId)} {(pay.AmountCents / 100m):0.00}", pay.Id));

        var expenseIds = await db.Expenses.Where(e => e.GroupId == groupId)
            .Select(e => e.Id).ToListAsync();
        foreach (var c in await db.ExpenseComments
                     .Where(c => expenseIds.Contains(c.ExpenseId) && c.CreatedAt < cutoff)
                     .OrderByDescending(c => c.CreatedAt).Take(take).ToListAsync())
            feed.Add(new("comment", c.CreatedAt, $"{N(c.AuthorId)} commented", c.ExpenseId));

        foreach (var n in await db.Nudges
                     .Where(n => n.GroupId == groupId && n.CreatedAt < cutoff)
                     .OrderByDescending(n => n.CreatedAt).Take(take).ToListAsync())
            feed.Add(new("nudge", n.CreatedAt, $"{N(n.FromUserId)} nudged {N(n.ToUserId)}", null));

        foreach (var m in await db.GroupMembers
                     .Where(m => m.GroupId == groupId && m.JoinedAt < cutoff)
                     .OrderByDescending(m => m.JoinedAt).Take(take).ToListAsync())
            feed.Add(new("join", m.JoinedAt, $"{N(m.UserId)} joined", null));

        return feed.OrderByDescending(r => r.At).Take(take).ToList();
    }

    /// <summary>
    /// Newest-first feed across every group the user belongs to. Returns at most
    /// <paramref name="limit"/> rows plus the cursor for the next page (null when
    /// the last page was reached).
    /// </summary>
    public async Task<(List<UserActivityRow> Items, DateTime? NextBefore)> UserFeedAsync(
        Guid userId, int limit, DateTime? before = null, Guid? onlyGroup = null)
    {
        var groupIds = await db.GroupMembers.Where(m => m.UserId == userId)
            .Select(m => m.GroupId).ToListAsync();
        if (onlyGroup is not null)
        {
            if (!groupIds.Contains(onlyGroup.Value)) return ([], null);
            groupIds = [onlyGroup.Value];
        }
        var groups = await db.Groups.Where(g => groupIds.Contains(g.Id) && g.DeletedAt == null)
            .Select(g => new { g.Id, g.Name }).ToListAsync();

        var merged = new List<UserActivityRow>();
        // One extra row per group tells us whether another page exists.
        foreach (var g in groups)
        {
            var rows = await GroupFeedAsync(g.Id, limit + 1, before);
            merged.AddRange(rows.Select(r =>
                new UserActivityRow(r.Kind, r.At, r.Text, r.Ref, g.Id, g.Name)));
        }

        var ordered = merged.OrderByDescending(r => r.At).ThenBy(r => r.GroupName)
            .ToList();
        if (ordered.Count <= limit) return (ordered, null);
        var page = ordered.Take(limit).ToList();
        return (page, page[^1].At);
    }
}
