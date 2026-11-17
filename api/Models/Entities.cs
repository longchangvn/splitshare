namespace SplitShare.Api.Models;

// V1 minimal entities. Full spec: requirements-splitshare.md §2.
// Amounts: integers in minor units (cents). Currency fixed per group.

public sealed class User
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string DisplayName { get; set; } = ""; // empty = not chosen yet; read Name for display
    public string Username { get; set; } = ""; // unique, lowercase (email for email sign-ups)
    public string Email { get; set; } = ""; // unique
    public string? Phone { get; set; }
    public string? PasswordHash { get; set; } // null if google-only
    public string? GoogleSub { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? EmailVerifiedAt { get; set; }
    public int FailedLoginAttempts { get; set; }
    public DateTime? LockedUntilUtc { get; set; }
    public string? AppleSub { get; set; }
    public string? FacebookId { get; set; }
    public string DefaultCurrency { get; set; } = "USD"; // pre-fills new groups; chosen at sign-up
    // Push preferences per notification type (per-group mutes live on PushDevice).
    public bool NotifyExpenses { get; set; } = true;
    public bool NotifyNudges { get; set; } = true;
    public bool NotifyInvites { get; set; } = true;

    /// <summary>Name to show: the chosen display name, or the email when none was set.</summary>
    [System.ComponentModel.DataAnnotations.Schema.NotMapped]
    public string Name => string.IsNullOrWhiteSpace(DisplayName) ? Email : DisplayName;
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
    // Trip-pack: budgets, modes, event fees, public sharing (all optional/additive).
    public long? BudgetCents { get; set; }
    public int BudgetAlertPct { get; set; } = 80;
    public string Mode { get; set; } = "shared"; // shared|trip|event
    public string Status { get; set; } = "opening"; // opening|locked|closed
    public long? FlatFeeCents { get; set; } // event mode per-head fee
    public string? ShareToken { get; set; } // public read-only page, rotated on demand
    public string? Emoji { get; set; } // group badge, e.g. "✈️"
    public string Category { get; set; } = "other"; // trip|home|couple|other
    public string? CoverKey { get; set; } // cover photo in IFileStore
    public string? CoverMime { get; set; }
    // Invite-link policy: join requests wait for an owner/treasurer; links stop working after expiry.
    public bool InviteRequiresApproval { get; set; }
    public DateTime? InviteExpiresAt { get; set; }
}

public sealed class GroupMember
{
    public Guid GroupId { get; set; }
    public Guid UserId { get; set; }
    public string Role { get; set; } = "member"; // owner|treasurer|member
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
    public bool DepositPaid { get; set; } // event-mode fee tracking
}

/// <summary>Per-group expense category. Defaults: food, stay, transport, other.</summary>
public sealed class GroupCategory
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GroupId { get; set; }
    public string Key { get; set; } = ""; // stable slug stored on Expense.Category
    public string Name { get; set; } = ""; // display label
    public int SortOrder { get; set; }
    public bool IsDefault { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
