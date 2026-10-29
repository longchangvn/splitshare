using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using SplitShare.Api.Auth;
using SplitShare.Api.Data;
using SplitShare.Api.Models;
using SplitShare.Api.Services;
using Group = SplitShare.Api.Models.Group;

namespace SplitShare.Api.Groups;

public sealed record GroupOp(bool Ok, string? ErrorCode, string? Error, object? Data = null);

public sealed record GroupCreated(Group Group, string InviteLink, int AddedMembers, int PendingInvites);
public sealed record MembersAdded(List<Guid> UserIds);
public sealed record InvitesResult(List<string> Added, List<string> Pending);
public sealed record JoinedGroup(Guid GroupId, bool AlreadyMember);
public sealed record NewInviteLink(string InviteLink);
public sealed record StatusResult(string Status);
public sealed record ResplitChange(Guid ExpenseId, string Title, string SplitType, long AmountCents,
    Dictionary<Guid, long> From, Dictionary<Guid, long> To);
public sealed record RemovalPreview(Guid UserId, long NetCents, string Strategy, bool CanRemove,
    List<string> Blockers, List<ResplitChange> Expenses, Dictionary<Guid, long> NetsAfter,
    string InputsHash, string Currency);
public sealed record MemberRemoved(string Status, int ResplitExpenses);

public sealed class GroupService(AppDbContext db, LedgerService ledger, IEmailSender email,
    IConfiguration config, CategoryService categories, GroupStatusPolicy statusPolicy)
{
    public const int MaxMembers = 50;
    public const int MaxGroupsPerUser = 200;
    private static readonly Regex CurrencyRe = new("^[A-Z]{3}$", RegexOptions.Compiled);

    private string BaseUrl => (config["App:BaseUrl"] ?? "http://localhost:3000").TrimEnd('/');
    public static string InviteLink(string baseUrl, string token) => $"{baseUrl}/g/{token}";

    public static string? ValidateName(string name)
        => name.Trim().Length is >= 3 and <= 50 ? null : "Name must be 3-50 chars.";

    public static string? ValidateCurrency(string currency)
        => CurrencyRe.IsMatch(currency) ? null : "Currency must be ISO-4217 (e.g. USD).";

    public async Task<string?> RoleAsync(Guid groupId, Guid userId)
        => (await db.GroupMembers.FindAsync(groupId, userId))?.Role;

    private async Task<GroupOp> GuardAsync(Guid groupId, Guid userId, bool ownerOnly)
    {
        var g = await db.Groups.FindAsync(groupId);
        if (g is null || g.DeletedAt is not null)
            return new(false, "NOT_FOUND", "Group not found.");
        var role = await RoleAsync(groupId, userId);
        if (role is null) return new(false, "FORBIDDEN", "Not a group member.");
        if (ownerOnly && role != "owner") return new(false, "FORBIDDEN", "Owner only.");
        var write = await statusPolicy.CheckWriteAsync(groupId, userId);
        if (!write.Allowed)
            return new(false, write.ErrorCode, write.Error);
        return new(true, null, null, g);
    }

    public static string? ValidateStatus(string status)
        => status is "opening" or "locked" or "closed"
            ? null
            : "status must be opening|locked|closed.";

    /// <summary>
    /// The owner can transition a group between its lifecycle states. This is the
    /// sole write that remains available while a group is closed.
    /// </summary>
    public async Task<GroupOp> UpdateStatusAsync(Guid actorId, Guid groupId, string? status)
    {
        var g = await db.Groups.FindAsync(groupId);
        if (g is null || g.DeletedAt is not null)
            return new(false, "NOT_FOUND", "Group not found.");
        if (await RoleAsync(groupId, actorId) != "owner")
            return new(false, "FORBIDDEN", "Owner only.");

        var next = (status ?? "").Trim().ToLowerInvariant();
        if (ValidateStatus(next) is { } error)
            return new(false, "VALIDATION", error);

        if (next == "closed" && g.Status != "closed")
        {
            var snapshot = await ledger.ComputeNetsAsync(groupId);
            if (snapshot is null || snapshot.Nets.Values.Any(v => v != 0))
                return new(false, "HAS_OPEN_BALANCE", "Close only when all balances are settled.");
        }

        g.Status = next;
        await db.SaveChangesAsync();
        return new(true, null, null, new StatusResult(next));
    }

    public async Task<GroupOp> CreateAsync(Guid creatorId, string name, string? currency,
        List<Guid> memberIds, List<string> inviteEmails)
    {
        name = name.Trim();
        currency = (currency ?? "USD").Trim().ToUpperInvariant();
        if (ValidateName(name) is { } ne) return new(false, "VALIDATION", ne);
        if (ValidateCurrency(currency) is { } ce) return new(false, "VALIDATION", ce);
        if (await db.GroupMembers.CountAsync(m => m.UserId == creatorId) >= MaxGroupsPerUser)
            return new(false, "GROUP_FULL", "Group limit reached (200).");

        var g = new Group { Name = name, Currency = currency, CreatedBy = creatorId };
        db.Groups.Add(g);
        db.GroupMembers.Add(new GroupMember { GroupId = g.Id, UserId = creatorId, Role = "owner" });
        await db.SaveChangesAsync();
        await categories.EnsureAsync(g.Id);

        var added = new List<Guid>();
        if (memberIds.Count > 0)
        {
            var r = await AddMembersAsync(creatorId, g.Id, memberIds);
            if (!r.Ok) return r;
            added = ((MembersAdded)r.Data!).UserIds;
        }
        var pending = new List<string>();
        if (inviteEmails.Count > 0)
        {
            var r = await InviteEmailsAsync(creatorId, g.Id, inviteEmails);
            if (!r.Ok) return r;
            pending = ((InvitesResult)r.Data!).Pending;
        }
        return new(true, null, null, new GroupCreated(g, InviteLink(BaseUrl, g.InviteToken), added.Count, pending.Count));
    }

    public async Task<GroupOp> AddMembersAsync(Guid actorId, Guid groupId, List<Guid> userIds)
    {
        var guard = await GuardAsync(groupId, actorId, ownerOnly: false);
        if (!guard.Ok) return guard;
        var distinct = userIds.Distinct().ToList();
        if (await db.GroupMembers.CountAsync(m => m.GroupId == groupId) + distinct.Count > MaxMembers)
            return new(false, "GROUP_FULL", $"Group is full (max {MaxMembers}).");
        var existing = await db.Users.Where(u => distinct.Contains(u.Id)).Select(u => u.Id).ToListAsync();
        if (existing.Count != distinct.Count)
            return new(false, "VALIDATION", "One or more users do not exist.");
        var already = await db.GroupMembers.Where(m => m.GroupId == groupId && distinct.Contains(m.UserId))
            .Select(m => m.UserId).ToListAsync();
        var fresh = distinct.Except(already).ToList();
        foreach (var id in fresh)
        {
            if (await db.GroupMembers.CountAsync(m => m.UserId == id) >= MaxGroupsPerUser)
                return new(false, "GROUP_FULL", "A user reached the group limit (200).");
            db.GroupMembers.Add(new GroupMember { GroupId = groupId, UserId = id });
        }
        await db.SaveChangesAsync();
        return new(true, null, null, new MembersAdded(fresh));
    }

    public async Task<GroupOp> InviteEmailsAsync(Guid actorId, Guid groupId, List<string> emails)
    {
        var guard = await GuardAsync(groupId, actorId, ownerOnly: false);
        if (!guard.Ok) return guard;
        var g = (Group)guard.Data!;
        var added = new List<string>();
        var pending = new List<string>();
        var outbox = new List<(string To, string Subject, string Body)>();
        var inviter = await db.Users.Where(u => u.Id == actorId).Select(u => u.DisplayName).FirstOrDefaultAsync()
            ?? "A friend";
        foreach (var raw in emails.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var em = raw.Trim().ToLowerInvariant();
            if (!AuthService.IsEmail(em)) return new(false, "VALIDATION", $"Invalid email: {raw}");
            var user = await db.Users.FirstOrDefaultAsync(u => u.Email == em);
            if (user is not null)
            {
                // V1 simplification: registered users are added directly + notified
                // (spec Accept/Decline flow deferred; see report).
                var r = await AddMembersAsync(actorId, groupId, [user.Id]);
                if (!r.Ok) return r;
                added.Add(em);
                outbox.Add((em, $"{inviter} added you to {g.Name} on SplitShare",
                    $"Hi {user.DisplayName},\n\n{inviter} added you to the group \"{g.Name}\" on SplitShare.\n" +
                    $"Open it here: {BaseUrl}/groups/{g.Id}"));
            }
            else
            {
                if (await db.PendingInvites.AnyAsync(p => p.GroupId == groupId && p.Email == em))
                {
                    pending.Add(em);
                    continue;
                }
                if (await db.GroupMembers.CountAsync(m => m.GroupId == groupId) + 1 > MaxMembers)
                    return new(false, "GROUP_FULL", $"Group is full (max {MaxMembers}).");
                db.PendingInvites.Add(new PendingInvite { GroupId = groupId, Email = em, InvitedBy = actorId });
                pending.Add(em);
                outbox.Add((em, $"{inviter} invited you to {g.Name} on SplitShare",
                    $"Hi,\n\n{inviter} invited you to split expenses in \"{g.Name}\" on SplitShare.\n" +
                    $"Join here: {InviteLink(BaseUrl, g.InviteToken)}\n\n" +
                    "Sign up with this email address within 30 days and you'll be added automatically."));
            }
        }
        await db.SaveChangesAsync();
        // Only after the invite rows are committed; sender is best-effort per address.
        foreach (var m in outbox)
        {
            try { await email.SendAsync(m.To, m.Subject, m.Body); }
            catch { /* invite mail must not fail the invite */ }
        }
        return new(true, null, null, new InvitesResult(added, pending));
    }

    public async Task<GroupOp> JoinByTokenAsync(Guid userId, string token)
    {
        var g = await db.Groups.FirstOrDefaultAsync(x => x.InviteToken == token && x.DeletedAt == null);
        if (g is null) return new(false, "INVITE_ROTATED", "Invite invalid or rotated.");
        if (g.Status != "opening") return new(false, "GROUP_READ_ONLY", "This group is read-only.");
        var user = await db.Users.FindAsync(userId);
        if (user is null) return new(false, "UNAUTH", "Not authenticated.");
        // Invite-token possession is the authorization: the link never expires
        // (only a deliberate owner rotate kills it), and register-time auto-join
        // of email invites has no verification gate either — so joining via the
        // link must not require a verified email (it is undeliverable in prod).
        if (await db.GroupMembers.FindAsync(g.Id, userId) is not null)
            return new(true, null, null, new JoinedGroup(g.Id, true));
        if (await db.GroupMembers.CountAsync(m => m.GroupId == g.Id) >= MaxMembers)
            return new(false, "GROUP_FULL", "Group is full.");
        if (await db.GroupMembers.CountAsync(m => m.UserId == userId) >= MaxGroupsPerUser)
            return new(false, "GROUP_FULL", "Group limit reached (200).");
        db.GroupMembers.Add(new GroupMember { GroupId = g.Id, UserId = userId });
        var pending = await db.PendingInvites
            .FirstOrDefaultAsync(p => p.GroupId == g.Id && p.Email == user.Email && p.ConsumedAt == null);
        if (pending is not null) pending.ConsumedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return new(true, null, null, new JoinedGroup(g.Id, false));
    }

    /// <summary>Auto-join pending email invites after registration (task 4.2).</summary>
    public async Task<List<Guid>> ConsumePendingInvitesAsync(string emailAddr, Guid userId)
    {
        if (await db.Users.FindAsync(userId) is null) return [];
        var em = emailAddr.Trim().ToLowerInvariant();
        var cutoff = DateTime.UtcNow.AddDays(-30);
        var rows = await db.PendingInvites
            .Where(p => p.Email == em && p.ConsumedAt == null && p.CreatedAt >= cutoff)
            .ToListAsync();
        var joined = new List<Guid>();
        foreach (var p in rows)
        {
            var g = await db.Groups.FindAsync(p.GroupId);
            if (g is null || g.DeletedAt is not null) continue;
            if (g.Status != "opening") continue;
            if (await db.GroupMembers.FindAsync(g.Id, userId) is not null)
            {
                p.ConsumedAt = DateTime.UtcNow;
                continue;
            }
            if (await db.GroupMembers.CountAsync(m => m.GroupId == g.Id) >= MaxMembers) continue;
            if (await db.GroupMembers.CountAsync(m => m.UserId == userId) >= MaxGroupsPerUser) continue;
            db.GroupMembers.Add(new GroupMember { GroupId = g.Id, UserId = userId });
            p.ConsumedAt = DateTime.UtcNow;
            joined.Add(g.Id);
        }
        await db.SaveChangesAsync();
        return joined;
    }

    public async Task<GroupOp> RotateInviteAsync(Guid actorId, Guid groupId)
    {
        var guard = await GuardAsync(groupId, actorId, ownerOnly: true);
        if (!guard.Ok) return guard;
        var g = (Group)guard.Data!;
        g.InviteToken = Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32));
        await db.SaveChangesAsync();
        return new(true, null, null, new NewInviteLink(InviteLink(BaseUrl, g.InviteToken)));
    }

    private async Task<GroupOp> DetachAsync(Guid groupId, Guid targetId, bool selfLeave)
    {
        var snapshot = await ledger.ComputeNetsAsync(groupId);
        if (snapshot is not null && snapshot.Nets.TryGetValue(targetId, out var net) && net != 0)
            return new(false, "HAS_OPEN_BALANCE", $"Settle balance first: {SettlementService.Fmt(net, snapshot.Currency)}.");
        var member = await db.GroupMembers.FindAsync(groupId, targetId);
        if (member is null) return new(false, "NOT_FOUND", "Not a group member.");
        if (member.Role == "owner"
            && !await db.GroupMembers.AnyAsync(m => m.GroupId == groupId && m.UserId != targetId && m.Role == "owner"))
            return new(false, "VALIDATION", "Transfer ownership first: sole owner cannot leave.");
        db.GroupMembers.Remove(member);
        db.MembershipArchives.Add(new MembershipArchive { GroupId = groupId, UserId = targetId });
        await db.SaveChangesAsync();
        return new(true, null, null, new StatusResult(selfLeave ? "left" : "removed"));
    }

    public const string StrategyResplit = "resplit";

    private sealed record RemovalPlan(RemovalPreview Preview, List<(Expense Expense, Expenses.ResplitResult Result)> Rewrites);

    /// <summary>
    /// Dry run of removing <paramref name="targetId"/> with the re-split strategy.
    /// A zero balance needs no rewrite (history already settled). Otherwise every open
    /// expense they share in is re-split by its own method; blockers are open
    /// expenses they paid and any balance left after the re-split (their payments).
    /// </summary>
    private async Task<RemovalPlan?> PlanRemovalAsync(Guid groupId, Guid targetId)
    {
        var snapshot = await ledger.ComputeNetsAsync(groupId);
        if (snapshot is null) return null;
        var nets = new Dictionary<Guid, long>(snapshot.Nets);
        var net = nets.GetValueOrDefault(targetId);
        var rewrites = new List<(Expense, Expenses.ResplitResult)>();
        var changes = new List<ResplitChange>();
        var blockers = new List<string>();
        if (net != 0)
        {
            var open = await db.Expenses.Include(e => e.Splits).Include(e => e.Guests)
                .Where(e => e.GroupId == groupId && e.Status == ExpenseStatus.Open && e.DeletedAt == null)
                .OrderBy(e => e.SpentAt).ThenBy(e => e.Id).ToListAsync();
            foreach (var e in open.Where(e => e.PayerId == targetId))
                blockers.Add($"Paid open expense \"{e.Title}\": reassign the payer or settle first.");
            foreach (var e in open.Where(e => e.PayerId != targetId && e.Splits.Any(s => s.UserId == targetId)))
            {
                var r = Expenses.MemberResplit.Resplit(e, targetId);
                var from = e.Splits.ToDictionary(s => s.UserId, s => s.ShareCents);
                var to = r.Lines.ToDictionary(l => l.UserId, l => l.ShareCents);
                foreach (var (u, c) in from) nets[u] = nets.GetValueOrDefault(u) + c;
                foreach (var (u, c) in to) nets[u] = nets.GetValueOrDefault(u) - c;
                rewrites.Add((e, r));
                changes.Add(new ResplitChange(e.Id, e.Title, e.SplitType.ToString().ToLowerInvariant(), e.AmountCents, from, to));
            }
            var residual = nets.GetValueOrDefault(targetId);
            if (blockers.Count == 0 && residual != 0)
                blockers.Add($"Balance left after re-split from payments: {SettlementService.Fmt(residual, snapshot.Currency)}. Settle or reverse those payments first.");
        }
        nets.Remove(targetId);
        return new(new RemovalPreview(targetId, net, StrategyResplit, blockers.Count == 0, blockers, changes,
            nets, snapshot.InputsHash, snapshot.Currency), rewrites);
    }

    public async Task<GroupOp> RemovalPreviewAsync(Guid actorId, Guid groupId, Guid targetId)
    {
        var guard = await GuardAsync(groupId, actorId, ownerOnly: true);
        if (!guard.Ok) return guard;
        if (await db.GroupMembers.FindAsync(groupId, targetId) is null) return new(false, "NOT_FOUND", "Not a group member.");
        var plan = await PlanRemovalAsync(groupId, targetId);
        return plan is null ? new(false, "NOT_FOUND", "Group not found.") : new(true, null, null, plan.Preview);
    }

    public async Task<GroupOp> RemoveMemberAsync(Guid actorId, Guid groupId, Guid targetId,
        string? strategy = null, string? expectedHash = null)
    {
        var guard = await GuardAsync(groupId, actorId, ownerOnly: true);
        if (!guard.Ok) return guard;
        if (string.IsNullOrWhiteSpace(strategy)) return await DetachAsync(groupId, targetId, selfLeave: false);
        if (!string.Equals(strategy.Trim(), StrategyResplit, StringComparison.OrdinalIgnoreCase))
            return new(false, "VALIDATION", "strategy must be resplit.");

        var member = await db.GroupMembers.FindAsync(groupId, targetId);
        if (member is null) return new(false, "NOT_FOUND", "Not a group member.");
        if (member.Role == "owner"
            && !await db.GroupMembers.AnyAsync(m => m.GroupId == groupId && m.UserId != targetId && m.Role == "owner"))
            return new(false, "VALIDATION", "Transfer ownership first: sole owner cannot leave.");
        var plan = await PlanRemovalAsync(groupId, targetId);
        if (plan is null) return new(false, "NOT_FOUND", "Group not found.");
        if (expectedHash is not null && expectedHash != plan.Preview.InputsHash)
            return new(false, "STALE_LEDGER", "The ledger changed since the preview; review again.");
        if (!plan.Preview.CanRemove)
            return new(false, "HAS_OPEN_BALANCE", string.Join(" ", plan.Preview.Blockers));

        foreach (var (e, r) in plan.Rewrites)
        {
            var from = e.Splits.ToDictionary(s => s.UserId, s => s.ShareCents);
            db.ExpenseGuests.RemoveRange(e.Guests.Where(g => r.DroppedGuestIds.Contains(g.Id)));
            foreach (var s in e.Splits.Where(s => r.Lines.All(l => l.UserId != s.UserId)).ToList())
                db.ExpenseSplits.Remove(s);
            foreach (var l in r.Lines)
            {
                var s = e.Splits.FirstOrDefault(x => x.UserId == l.UserId);
                if (s is null) db.ExpenseSplits.Add(s = new ExpenseSplit { ExpenseId = e.Id, UserId = l.UserId });
                s.ShareCents = l.ShareCents;
                s.ExactCents = l.ExactCents;
                s.Percent = l.Percent;
                s.Shares = l.Shares;
            }
            e.Version++;
            e.UpdatedAt = DateTime.UtcNow;
            db.ExpenseAudits.Add(new ExpenseAudit
            {
                ExpenseId = e.Id, ActorId = actorId,
                DiffJson = System.Text.Json.JsonSerializer.Serialize(new
                {
                    member_removed = targetId,
                    splits = new { from, to = r.Lines.ToDictionary(l => l.UserId, l => l.ShareCents) }
                })
            });
        }
        db.GroupMembers.Remove(member);
        db.MembershipArchives.Add(new MembershipArchive { GroupId = groupId, UserId = targetId });
        await db.SaveChangesAsync();
        if (plan.Rewrites.Count > 0) await ledger.RecomputeAsync(groupId);
        return new(true, null, null, new MemberRemoved("removed", plan.Rewrites.Count));
    }

    public async Task<GroupOp> LeaveAsync(Guid userId, Guid groupId)
    {
        var guard = await GuardAsync(groupId, userId, ownerOnly: false);
        if (!guard.Ok) return guard;
        return await DetachAsync(groupId, userId, selfLeave: true);
    }

    public async Task<GroupOp> RenameAsync(Guid actorId, Guid groupId, string name)
    {
        var guard = await GuardAsync(groupId, actorId, ownerOnly: true);
        if (!guard.Ok) return guard;
        if (ValidateName(name) is { } ne) return new(false, "VALIDATION", ne);
        ((Group)guard.Data!).Name = name.Trim();
        await db.SaveChangesAsync();
        return new(true, null, null, null);
    }

    public static string? ValidateMode(string mode)
        => mode is "shared" or "trip" or "event" ? null : "mode must be shared|trip|event.";

    /// <summary>Owner settings: budget, alert pct, mode, flat fee. All optional.</summary>
    public async Task<GroupOp> UpdateSettingsAsync(Guid actorId, Guid groupId,
        decimal? budget, int? budgetAlertPct, string? mode, decimal? flatFee)
    {
        var guard = await GuardAsync(groupId, actorId, ownerOnly: true);
        if (!guard.Ok) return guard;
        var g = (Group)guard.Data!;
        if (budget is not null)
        {
            if (budget.Value < 0) return new(false, "VALIDATION", "budget must be >= 0 (0 clears).");
            g.BudgetCents = budget.Value == 0 ? null : (long)(budget.Value * 100m);
        }
        if (budgetAlertPct is not null)
        {
            if (budgetAlertPct is < 1 or > 100) return new(false, "VALIDATION", "budget_alert_pct must be 1-100.");
            g.BudgetAlertPct = budgetAlertPct.Value;
        }
        if (mode is not null)
        {
            var m = mode.Trim().ToLowerInvariant();
            if (ValidateMode(m) is { } me) return new(false, "VALIDATION", me);
            g.Mode = m;
        }
        if (flatFee is not null)
        {
            if (flatFee.Value < 0) return new(false, "VALIDATION", "flat_fee must be >= 0 (0 clears).");
            g.FlatFeeCents = flatFee.Value == 0 ? null : (long)(flatFee.Value * 100m);
        }
        await db.SaveChangesAsync();
        return new(true, null, null, null);
    }

    public async Task<GroupOp> SetRoleAsync(Guid actorId, Guid groupId, Guid targetId, string role)
    {
        var guard = await GuardAsync(groupId, actorId, ownerOnly: true);
        if (!guard.Ok) return guard;
        role = role.Trim().ToLowerInvariant();
        if (role is not ("member" or "treasurer")) return new(false, "VALIDATION", "role must be member|treasurer.");
        var member = await db.GroupMembers.FindAsync(groupId, targetId);
        if (member is null) return new(false, "NOT_FOUND", "Not a group member.");
        if (member.Role == "owner") return new(false, "VALIDATION", "Owner role cannot be changed.");
        member.Role = role;
        await db.SaveChangesAsync();
        return new(true, null, null, new StatusResult("ok"));
    }

    public async Task<GroupOp> SetDepositAsync(Guid actorId, Guid groupId, Guid targetId, bool paid)
    {
        var guard = await GuardAsync(groupId, actorId, ownerOnly: false);
        if (!guard.Ok) return guard;
        var actorRole = await RoleAsync(groupId, actorId);
        if (targetId != actorId && actorRole is not ("owner" or "treasurer"))
            return new(false, "FORBIDDEN", "Only owner/treasurer can mark others.");
        var member = await db.GroupMembers.FindAsync(groupId, targetId);
        if (member is null) return new(false, "NOT_FOUND", "Not a group member.");
        member.DepositPaid = paid;
        await db.SaveChangesAsync();
        return new(true, null, null, new StatusResult(paid ? "paid" : "unpaid"));
    }

    /// <summary>Event mode: one EQUAL expense of flat_fee across active members.</summary>
    public async Task<GroupOp> FlatFeeAsync(Guid actorId, Guid groupId, Guid payerId, string? title,
        Expenses.ExpenseService expenses)
    {
        var guard = await GuardAsync(groupId, actorId, ownerOnly: false);
        if (!guard.Ok) return guard;
        var g = (Group)guard.Data!;
        if (g.FlatFeeCents is not { } fee || fee <= 0)
            return new(false, "VALIDATION", "Set a flat_fee first.");
        var actorRole = await RoleAsync(groupId, actorId);
        if (actorRole is not ("owner" or "treasurer"))
            return new(false, "FORBIDDEN", "Only owner or treasurer can bill the flat fee.");
        var members = await db.GroupMembers.Where(m => m.GroupId == groupId).Select(m => m.UserId).ToListAsync();
        if (!members.Contains(payerId)) return new(false, "VALIDATION", "Payer must be an active member.");
        var r = await expenses.CreateAsync(actorId, groupId, title?.Trim() is { Length: > 0 } t ? t : $"{g.Name} fee",
            null, fee / 100m, payerId, Models.SplitType.Equal, members, null, null, null);
        return r.Ok ? new(true, null, null, r.Data) : new(false, r.ErrorCode, r.Error);
    }

    public async Task<GroupOp> ShareLinkAsync(Guid actorId, Guid groupId)
    {
        var guard = await GuardAsync(groupId, actorId, ownerOnly: true);
        if (!guard.Ok) return guard;
        var g = (Group)guard.Data!;
        g.ShareToken = Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(16));
        await db.SaveChangesAsync();
        return new(true, null, null, new NewInviteLink($"{BaseUrl}/s/{g.ShareToken}"));
    }

    public static readonly IReadOnlyDictionary<string, (string Mode, decimal? Budget, decimal? FlatFee, string[] Recurring)> Templates
        = new Dictionary<string, (string, decimal?, decimal?, string[])>(StringComparer.OrdinalIgnoreCase)
        {
            ["roommates"] = ("shared", null, null, ["Rent|1500|monthly", "Wifi|30|monthly"]),
            ["beach-trip"] = ("trip", 2000m, null, []),
            ["wedding"] = ("event", 10000m, 200m, []),
        };

    /// <summary>One-click configured group: mode + budget + flat fee + inactive recurring drafts.
    /// No template validation: an unknown (or empty) template simply creates a plain
    /// group — only known template keys contribute presets. Explicit budget/flat fee
    /// always apply.</summary>
    public async Task<GroupOp> FromTemplateAsync(Guid creatorId, string name, string? currency,
        string template, decimal? budget, decimal? flatFee)
    {
        var created = await CreateAsync(creatorId, name, currency, [], []);
        if (!created.Ok) return created;
        var g = ((GroupCreated)created.Data!).Group;
        var key = template?.Trim();
        if (!string.IsNullOrWhiteSpace(key) && Templates.TryGetValue(key, out var t))
        {
            g.Mode = t.Mode;
            var effBudget = budget ?? t.Budget;
            if (effBudget is { } eb) g.BudgetCents = (long)(eb * 100m);
            var effFee = flatFee ?? t.FlatFee;
            if (effFee is { } ef) g.FlatFeeCents = (long)(ef * 100m);
            foreach (var spec in t.Recurring)
            {
                var parts = spec.Split('|');
                db.RecurringRules.Add(new Models.RecurringRule
                {
                    GroupId = g.Id, Title = parts[0], AmountCents = (long)(decimal.Parse(parts[1]) * 100m),
                    Frequency = parts[2], PayerId = creatorId,
                    ParticipantIdsJson = System.Text.Json.JsonSerializer.Serialize(new[] { creatorId }),
                    NextRunAt = DateTime.UtcNow.AddDays(30), Active = false, CreatedBy = creatorId
                });
            }
        }
        else
        {
            if (budget is { } b) g.BudgetCents = (long)(b * 100m);
            if (flatFee is { } f) g.FlatFeeCents = (long)(f * 100m);
        }
        await db.SaveChangesAsync();
        return new(true, null, null, new GroupCreated(g, InviteLink(BaseUrl, g.InviteToken), 0, 0));
    }

    public async Task<object?> BudgetViewAsync(Guid groupId)
    {
        var g = await db.Groups.FindAsync(groupId);
        if (g is null || g.BudgetCents is not { } budget) return null;
        var spent = await db.Expenses.Where(e => e.GroupId == groupId && e.DeletedAt == null)
            .SumAsync(e => e.AmountCents);
        return new
        {
            budget_cents = budget,
            spent_cents = spent,
            pct = budget == 0 ? 0 : Math.Round(spent * 100m / budget, 1),
            alert = spent >= budget * g.BudgetAlertPct / 100,
            over = spent > budget,
            alert_pct = g.BudgetAlertPct
        };
    }

    public async Task<GroupOp> DeleteAsync(Guid actorId, Guid groupId)
    {
        var guard = await GuardAsync(groupId, actorId, ownerOnly: true);
        if (!guard.Ok) return guard;
        var hasExpenses = await db.Expenses.AnyAsync(e => e.GroupId == groupId && e.DeletedAt == null);
        if (hasExpenses)
        {
            var snapshot = await ledger.ComputeNetsAsync(groupId);
            if (snapshot is null || snapshot.Nets.Values.Any(v => v != 0))
                return new(false, "HAS_OPEN_BALANCE", "Delete only when fully settled.");
        }
        ((Group)guard.Data!).DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return new(true, null, null, new StatusResult("deleted"));
    }
}
