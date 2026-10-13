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

public sealed class GroupService(AppDbContext db, LedgerService ledger, IEmailSender email, IConfiguration config)
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
        return new(true, null, null, g);
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
                await email.SendAsync(em, $"Added to {g.Name}",
                    $"{g.Name} on SplitShare — open {BaseUrl} to view it.");
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
                await email.SendAsync(em, $"Join {g.Name} on SplitShare",
                    $"Join here: {InviteLink(BaseUrl, g.InviteToken)} (register with this email within 30 days).");
            }
        }
        await db.SaveChangesAsync();
        return new(true, null, null, new InvitesResult(added, pending));
    }

    public async Task<GroupOp> JoinByTokenAsync(Guid userId, string token)
    {
        var g = await db.Groups.FirstOrDefaultAsync(x => x.InviteToken == token && x.DeletedAt == null);
        if (g is null) return new(false, "INVITE_ROTATED", "Invite invalid or rotated.");
        var user = await db.Users.FindAsync(userId);
        if (user is null) return new(false, "UNAUTH", "Not authenticated.");
        if (user.EmailVerifiedAt is null)
            return new(false, "FORBIDDEN", "Verify your email before joining groups.");
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

    public async Task<GroupOp> RemoveMemberAsync(Guid actorId, Guid groupId, Guid targetId)
    {
        var guard = await GuardAsync(groupId, actorId, ownerOnly: true);
        if (!guard.Ok) return guard;
        return await DetachAsync(groupId, targetId, selfLeave: false);
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
