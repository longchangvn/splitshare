namespace SplitShare.Api.Models;

// Amounts: integers in minor units (cents). Currency fixed per group (see Group).

public enum SplitType
{
    Equal,
    Exact,
    Percent,
    Shares
}

public enum ExpenseStatus
{
    Open,
    Locked
}

public sealed class Expense
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GroupId { get; set; }
    public string Title { get; set; } = "";
    public string? Description { get; set; }
    public long AmountCents { get; set; }
    public Guid PayerId { get; set; }
    public SplitType SplitType { get; set; } = SplitType.Equal;
    public ExpenseStatus Status { get; set; } = ExpenseStatus.Open;
    public Guid CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public int Version { get; set; } = 1; // optimistic locking (expected_version)
    public DateTime? DeletedAt { get; set; } // soft delete
    public List<ExpenseSplit> Splits { get; set; } = [];
    public List<ExpenseImage> Images { get; set; } = [];
}

public sealed class ExpenseSplit
{
    public Guid ExpenseId { get; set; }
    public Guid UserId { get; set; }
    public long ShareCents { get; set; }
    public long? ExactCents { get; set; }
    public decimal? Percent { get; set; }
    public int? Shares { get; set; }
}

public sealed class ExpenseImage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ExpenseId { get; set; }
    public string StorageKey { get; set; } = "";
    public string Mime { get; set; } = "";
    public long SizeBytes { get; set; }
    public Guid UploadedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public sealed class Payment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GroupId { get; set; }
    public Guid FromUserId { get; set; } // debtor
    public Guid ToUserId { get; set; } // creditor
    public long AmountCents { get; set; }
    public string Method { get; set; } = "transfer"; // cash|transfer|other
    public string? Note { get; set; }
    public Guid CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ReversedAt { get; set; }
    public ExpenseStatus Status { get; set; } = ExpenseStatus.Open; // locked on group settle
}

public sealed class SettlementPlan
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GroupId { get; set; }
    public int VersionSeq { get; set; }
    public DateTime ComputedAt { get; set; } = DateTime.UtcNow;
    public string InputsHash { get; set; } = "";
    public string TransfersJson { get; set; } = "[]"; // [{from,to,amount_cents}]
    public string ExplanationJson { get; set; } = "{}"; // {steps[],before_nets{},after_nets{},raw_debts,saved}
}

public sealed class ExpenseAudit
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ExpenseId { get; set; }
    public Guid ActorId { get; set; }
    public string DiffJson { get; set; } = "{}";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public sealed class IdempotencyKey
{
    public string Key { get; set; } = ""; // client-supplied Idempotency-Key
    public string Endpoint { get; set; } = ""; // e.g. POST /api/v1/groups/:id/payments
    public int ResponseStatus { get; set; }
    public string ResponseJson { get; set; } = "{}";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
