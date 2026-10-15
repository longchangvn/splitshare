namespace SplitShare.Api.Models;

// Trip-pack entities: guests, social, recurring, payment handles/proof.
// Amounts in minor units (cents); additive only.

/// <summary>Guest share riding on a covering member's split line.</summary>
public sealed class ExpenseGuest
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ExpenseId { get; set; }
    public Guid CoveredByUserId { get; set; }
    public string Label { get; set; } = ""; // e.g. "Kid"
    public long ShareCents { get; set; }
}

public sealed class ExpenseComment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ExpenseId { get; set; }
    public Guid AuthorId { get; set; }
    public string Body { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public sealed class Nudge
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GroupId { get; set; }
    public Guid FromUserId { get; set; }
    public Guid ToUserId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public sealed class RecurringRule
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GroupId { get; set; }
    public string Title { get; set; } = "";
    public long AmountCents { get; set; }
    public SplitType SplitType { get; set; } = SplitType.Equal;
    public Guid PayerId { get; set; }
    public string ParticipantIdsJson { get; set; } = "[]"; // Guid[]
    public string Frequency { get; set; } = "monthly"; // weekly|monthly
    public DateTime NextRunAt { get; set; } = DateTime.UtcNow;
    public bool Active { get; set; } = true;
    public Guid CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastRunAt { get; set; }
}

public sealed class PaymentHandle
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string Label { get; set; } = ""; // e.g. "Vietcombank"
    public string Details { get; set; } = ""; // account number / QR text
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public sealed class PaymentProof
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid PaymentId { get; set; }
    public string StorageKey { get; set; } = "";
    public string Mime { get; set; } = "";
    public long SizeBytes { get; set; }
    public Guid UploadedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
