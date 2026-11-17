namespace SplitShare.Api.Models;

/// <summary>Email invite for an unregistered address. Auto-consumed on registration (task 4.2).</summary>
public sealed class PendingInvite
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GroupId { get; set; }
    public string Email { get; set; } = ""; // normalized lowercase
    public Guid InvitedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ConsumedAt { get; set; }
    /// <summary>SHA-256 of the single-use token in the emailed /invite/{token} link; rotated on resend.</summary>
    public string? TokenHash { get; set; }
}

/// <summary>Invite-link join waiting for owner/treasurer approval (Group.InviteRequiresApproval).</summary>
public sealed class JoinRequest
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GroupId { get; set; }
    public Guid UserId { get; set; }
    public string Status { get; set; } = "pending"; // pending|approved|rejected
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? DecidedAt { get; set; }
    public Guid? DecidedBy { get; set; }
}

/// <summary>Stored result of a member removal with re-split (Re-Split Audit Breakdown screen).</summary>
public sealed class MemberRemovalAudit
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GroupId { get; set; }
    public Guid RemovedUserId { get; set; }
    public Guid ActorId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public long UncollectedCents { get; set; }
    public string DetailJson { get; set; } = "{}"; // {expenses:[{id,title,before{},after{}}], nets_before{}, nets_after{}}
}

/// <summary>Removal record for the removed-member ledger snapshot rule (task 7.1).</summary>
public sealed class MembershipArchive
{
    public Guid GroupId { get; set; }
    public Guid UserId { get; set; }
    public DateTime RemovedAt { get; set; } = DateTime.UtcNow;
}
