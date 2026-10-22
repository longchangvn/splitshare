using Microsoft.EntityFrameworkCore;
using SplitShare.Api.Data;
using SplitShare.Api.Models;

namespace SplitShare.Api.Groups;

public sealed record GroupWriteDecision(
    bool Allowed,
    string? ErrorCode,
    string? Error,
    Group? Group = null,
    string? Role = null);

public sealed class GroupStatusPolicy(AppDbContext db)
{
    public async Task<GroupWriteDecision> CheckWriteAsync(Guid groupId, Guid actorId)
    {
        var group = await db.Groups.FindAsync(groupId);
        if (group is null || group.DeletedAt is not null)
            return new(false, "NOT_FOUND", "Group not found.");

        var role = (await db.GroupMembers.FindAsync(groupId, actorId))?.Role;
        if (role is null)
            return new(false, "FORBIDDEN", "Not a group member.");

        var status = (group.Status ?? "opening").Trim().ToLowerInvariant();
        if (status == "closed" || (status == "locked" && role != "owner"))
            return new(false, "GROUP_READ_ONLY", "This group is read-only.", group, role);

        return new(true, null, null, group, role);
    }

    public async Task<bool> CanMaterializeAsync(Guid groupId)
        => await db.Groups.AnyAsync(g => g.Id == groupId && g.DeletedAt == null
            && (g.Status ?? "opening").ToLower() == "opening");
}
