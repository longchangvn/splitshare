namespace SplitShare.Api.Models;

// V1 minimal entities. Full spec: requirements-splitshare.md §2.
// Amounts: integers in minor units (cents). Currency fixed per group.

public sealed class User
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string DisplayName { get; set; } = "";
    public string Username { get; set; } = ""; // unique, lowercase
    public string Email { get; set; } = ""; // unique
    public string? Phone { get; set; }
    public string? PasswordHash { get; set; } // null if google-only
    public string? GoogleSub { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? EmailVerifiedAt { get; set; }
    public int FailedLoginAttempts { get; set; }
    public DateTime? LockedUntilUtc { get; set; }
}

public sealed class Group
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "";
    public string Currency { get; set; } = "USD"; // immutable after first expense
    public string InviteToken { get; set; } = Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32));
    public Guid CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? DeletedAt { get; set; }
    public List<GroupMember> Members { get; set; } = [];
}

public sealed class GroupMember
{
    public Guid GroupId { get; set; }
    public Guid UserId { get; set; }
    public string Role { get; set; } = "member"; // owner|member
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
}
