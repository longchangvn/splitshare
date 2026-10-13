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
}

/// <summary>Removal record for the removed-member ledger snapshot rule (task 7.1).</summary>
public sealed class MembershipArchive
{
    public Guid GroupId { get; set; }
    public Guid UserId { get; set; }
    public DateTime RemovedAt { get; set; } = DateTime.UtcNow;
}
