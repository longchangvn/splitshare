using Microsoft.EntityFrameworkCore;
using SplitShare.Api.Data;
using SplitShare.Api.Groups;
using SplitShare.Api.Models;

namespace SplitShare.Tests;

public sealed class GroupStatusTests
{
    private static AppDbContext Db()
        => new(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    [Fact]
    public async Task NewGroup_DefaultsToOpening()
    {
        var group = new Group();

        Assert.Equal("opening", group.Status);
    }

    [Fact]
    public async Task LifecyclePolicy_OpeningAllowsMember_LockAllowsOnlyOwner_ClosedRejectsAllWrites()
    {
        var db = Db();
        var ownerId = Guid.NewGuid();
        var memberId = Guid.NewGuid();
        var group = new Group { Name = "Trip", CreatedBy = ownerId };
        db.Groups.Add(group);
        db.GroupMembers.AddRange(
            new GroupMember { GroupId = group.Id, UserId = ownerId, Role = "owner" },
            new GroupMember { GroupId = group.Id, UserId = memberId, Role = "member" });
        await db.SaveChangesAsync();
        var policy = new GroupStatusPolicy(db);

        var openingMember = await policy.CheckWriteAsync(group.Id, memberId);
        Assert.True(openingMember.Allowed);

        group.Status = "locked";
        await db.SaveChangesAsync();
        var lockedMember = await policy.CheckWriteAsync(group.Id, memberId);
        var lockedOwner = await policy.CheckWriteAsync(group.Id, ownerId);
        Assert.False(lockedMember.Allowed);
        Assert.Equal("GROUP_READ_ONLY", lockedMember.ErrorCode);
        Assert.True(lockedOwner.Allowed);

        group.Status = "closed";
        await db.SaveChangesAsync();
        var closedOwner = await policy.CheckWriteAsync(group.Id, ownerId);
        Assert.False(closedOwner.Allowed);
        Assert.Equal("GROUP_READ_ONLY", closedOwner.ErrorCode);
    }
}
