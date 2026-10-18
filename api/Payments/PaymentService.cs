using System.Data;
using Microsoft.EntityFrameworkCore;
using SplitShare.Api.Data;
using SplitShare.Api.Data.Providers;
using SplitShare.Api.Models;
using SplitShare.Api.Services;

namespace SplitShare.Api.Payments;

public sealed record PaymentOp(bool Ok, string? ErrorCode, string? Error, object? Data = null);

public sealed record PaymentRecorded(Payment Payment, bool FullySettled, int SettlementVersion);
public sealed record PaymentReversed(Payment Payment, int SettlementVersion);

public sealed class PaymentService(AppDbContext db, LedgerService ledger, IDatabaseProvider? provider = null, Notifications.GroupNotifier? notifier = null)
{
    private static readonly HashSet<string> Methods =
        new(StringComparer.OrdinalIgnoreCase) { "cash", "transfer", "other" };

    private async Task<bool> IsCurrentOrFormerAsync(Guid groupId, Guid userId)
        => await db.GroupMembers.FindAsync(groupId, userId) is not null
        || await db.MembershipArchives.FindAsync(groupId, userId) is not null;

    /// <returns>Max the debtor may pay now: -net when negative, else raw owed total.</returns>
    public static long MaxPayable(Dictionary<Guid, long> nets, Guid from, long rawOwed)
        => nets.TryGetValue(from, out var net) && net < 0 ? -net : rawOwed;

    private async Task<long> RawOwedAsync(Guid groupId, Guid userId)
        => await db.Expenses
            .Where(e => e.GroupId == groupId && e.Status == ExpenseStatus.Open && e.DeletedAt == null)
            .SelectMany(e => e.Splits)
            .Where(s => s.UserId == userId && s.ShareCents > 0)
            .SumAsync(s => (long?)s.ShareCents) ?? 0;

    public async Task<PaymentOp> RecordAsync(Guid actorId, Guid groupId, Guid from, Guid to,
        decimal amount, string method, string? note, string? proofRef = null)
    {
        var g = await db.Groups.FindAsync(groupId);
        if (g is null || g.DeletedAt is not null) return new(false, "NOT_FOUND", "Group not found.");
        var role = (await db.GroupMembers.FindAsync(groupId, actorId))?.Role;
        if (role is null) return new(false, "FORBIDDEN", "Not a group member.");
        if (from == to) return new(false, "VALIDATION", "Payer and payee must differ.");
        if (!Methods.Contains(method)) return new(false, "VALIDATION", "method must be cash|transfer|other.");
        if (note is not null && note.Length > 280) return new(false, "VALIDATION", "Note max 280 chars.");
        if (proofRef is not null && proofRef.Length > 140) return new(false, "VALIDATION", "proof_ref max 140 chars.");
        if (amount <= 0) return new(false, "VALIDATION", "Amount must be > 0.");
        if (amount * 100m != Math.Floor(amount * 100m))
            return new(false, "VALIDATION", "Amount supports max 2 decimals.");
        if (!await IsCurrentOrFormerAsync(groupId, from) || !await IsCurrentOrFormerAsync(groupId, to))
            return new(false, "VALIDATION", "Both parties must be current or former members.");
        if (actorId != from && actorId != to && role != "owner" && role != "treasurer")
            return new(false, "FORBIDDEN", "Only the debtor, creditor, owner or treasurer can record.");

        // Serializable re-check: concurrent overpayments serialize; the loser
        // retries the read and is rejected as OVERPAYMENT below.
        // (Skipped when no transactional provider is wired, e.g. InMemory unit tests.)
        var tx = provider?.SupportsTransactions == true
            ? await db.Database.BeginTransactionAsync(IsolationLevel.Serializable)
            : null;
        try
        {
            var snapshot = await ledger.ComputeNetsAsync(groupId);
            if (snapshot is null) return new(false, "NOT_FOUND", "Group not found.");
            if (snapshot.Nets.Values.All(v => v == 0))
                return new(false, "ALREADY_SETTLED", "Group is fully settled.");
            var cents = (long)(amount * 100m);
            var max = MaxPayable(snapshot.Nets, from, await RawOwedAsync(groupId, from));
            if (max <= 0 || cents > max)
                return new(false, "OVERPAYMENT",
                    max <= 0 ? "Nothing owed." : $"Max payable is {SettlementService.Fmt(max, snapshot.Currency)}.");

            var p = new Payment
            {
                GroupId = groupId, FromUserId = from, ToUserId = to, AmountCents = cents,
                Method = method.ToLowerInvariant(), Note = note, ProofRef = proofRef, CreatedBy = actorId
            };
            db.Payments.Add(p);
            await db.SaveChangesAsync();
            var (plan, _) = await ledger.RecomputeAsync(groupId);
            var settled = await TryLockAsync(groupId);
            if (tx is not null) await tx.CommitAsync();
            if (notifier is not null)
                await notifier.NotifyPaymentAsync(groupId, actorId, cents, g.Currency);
            return new(true, null, null, new PaymentRecorded(p, settled, plan.VersionSeq));
        }
        catch (DbUpdateException ex) when (provider?.IsConcurrencyConflict(ex) == true)
        {
            if (tx is not null) await tx.RollbackAsync();
            return new(false, "OVERPAYMENT", "Concurrent payment changed balances; re-check and retry.");
        }
        finally
        {
            if (tx is not null) await tx.DisposeAsync();
        }
    }

    /// <summary>Locks all OPEN rows once every net hits zero. Returns true when locked.</summary>
    private async Task<bool> TryLockAsync(Guid groupId)
    {
        var snapshot = await ledger.ComputeNetsAsync(groupId);
        if (snapshot is null || snapshot.Nets.Values.Any(v => v != 0)) return false;
        foreach (var e in await db.Expenses
                     .Where(e => e.GroupId == groupId && e.Status == ExpenseStatus.Open && e.DeletedAt == null)
                     .ToListAsync())
            e.Status = ExpenseStatus.Locked;
        foreach (var p in await db.Payments
                     .Where(p => p.GroupId == groupId && p.Status == ExpenseStatus.Open && p.ReversedAt == null)
                     .ToListAsync())
            p.Status = ExpenseStatus.Locked;
        await db.SaveChangesAsync();
        return true;
    }

    public async Task<PaymentOp> ReverseAsync(Guid actorId, Guid paymentId)
    {
        var p = await db.Payments.FindAsync(paymentId);
        if (p is null || p.ReversedAt is not null) return new(false, "NOT_FOUND", "Payment not found.");
        var g = await db.Groups.FindAsync(p.GroupId);
        if (g is null || g.DeletedAt is not null) return new(false, "NOT_FOUND", "Group not found.");
        if ((await db.GroupMembers.FindAsync(p.GroupId, actorId))?.Role is not ("owner" or "treasurer"))
            return new(false, "FORBIDDEN", "Owner or treasurer only.");
        if (DateTime.UtcNow - p.CreatedAt > TimeSpan.FromHours(24))
            return new(false, "VALIDATION", "Reversal window (24h) expired; record a counter-payment.");
        if (await db.Expenses.AnyAsync(e => e.GroupId == p.GroupId && e.Status == ExpenseStatus.Locked)
            || await db.Payments.AnyAsync(x => x.GroupId == p.GroupId && x.Status == ExpenseStatus.Locked))
            return new(false, "EXPENSE_LOCKED", "Group locked since; record a counter-payment.");
        p.ReversedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        var (plan, _) = await ledger.RecomputeAsync(p.GroupId);
        return new(true, null, null, new PaymentReversed(p, plan.VersionSeq));
    }
}
