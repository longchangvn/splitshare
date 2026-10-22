using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SplitShare.Api.Common;
using SplitShare.Api.Data;
using SplitShare.Api.Models;

namespace SplitShare.Api.Services;

public sealed record GroupNets(
    Dictionary<Guid, long> Nets,
    Dictionary<Guid, string> Names,
    int RawDebts,
    string InputsHash,
    string Currency);

/// <summary>
/// Net balances + settlement persistence per spec §2/§5.
/// net[u] = paid - owed + paid_out - received (cents); sum(nets) == 0 invariant.
/// (A debtor's payment raises their net toward zero; a creditor's receipt lowers it.)
/// </summary>
public sealed class LedgerService(AppDbContext db)
{
    public async Task<Group?> GetGroupAsync(Guid groupId)
        => await db.Groups.FindAsync(groupId);

    public async Task<bool> CanViewAsync(Guid groupId, Guid userId)
        => await db.GroupMembers.FindAsync(groupId, userId) is not null
        || await db.MembershipArchives.FindAsync(groupId, userId) is not null;

    /// <summary>
    /// Pure nets adjustment for a single expense mutation (no DB access).
    /// Mirrors ComputeNetsAsync arithmetic exactly; used for un-settle previews.
    /// </summary>
    public static Dictionary<Guid, long> ApplyDelta(
        IDictionary<Guid, long> nets,
        (Guid Payer, long Amount, Dictionary<Guid, long> Splits)? old,
        (Guid Payer, long Amount, Dictionary<Guid, long> Splits)? @new)
    {
        var result = new Dictionary<Guid, long>(nets);
        void Add(Guid id, long v) { result.TryGetValue(id, out var c); result[id] = c + v; }
        if (old is { } o)
        {
            Add(o.Payer, -o.Amount);
            foreach (var s in o.Splits) Add(s.Key, s.Value);
        }
        if (@new is { } n)
        {
            Add(n.Payer, n.Amount);
            foreach (var s in n.Splits) Add(s.Key, -s.Value);
        }
        return result;
    }

    public async Task<GroupNets?> ComputeNetsAsync(Guid groupId)
    {
        var group = await db.Groups.FindAsync(groupId);
        if (group is null || group.DeletedAt is not null) return null;

        var memberIds = await db.GroupMembers.Where(m => m.GroupId == groupId)
            .Select(m => m.UserId).ToListAsync();
        var users = await db.Users.Where(u => memberIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.DisplayName);

        var nets = memberIds.ToDictionary(id => id, _ => 0L);
        var expenses = await db.Expenses
            .Where(e => e.GroupId == groupId && e.Status == ExpenseStatus.Open && e.DeletedAt == null)
            .Include(e => e.Splits).ToListAsync();
        var payments = await db.Payments
            .Where(p => p.GroupId == groupId && p.Status == ExpenseStatus.Open && p.ReversedAt == null)
            .ToListAsync();

        var rawDebts = 0;
        var hashParts = new List<string>();
        foreach (var e in expenses.OrderBy(e => e.Id))
        {
            hashParts.Add($"expense:{e.Id:N}:{e.Version}:{e.AmountCents}");
            if (!nets.ContainsKey(e.PayerId)) nets[e.PayerId] = 0;
            nets[e.PayerId] += e.AmountCents;
            foreach (var s in e.Splits)
            {
                if (!nets.ContainsKey(s.UserId)) nets[s.UserId] = 0;
                nets[s.UserId] -= s.ShareCents;
                if (s.ShareCents > 0 && s.UserId != e.PayerId) rawDebts++;
            }
        }
        foreach (var p in payments.OrderBy(p => p.Id))
        {
            hashParts.Add($"payment:{p.Id:N}:{p.AmountCents}");
            if (!nets.ContainsKey(p.FromUserId)) nets[p.FromUserId] = 0;
            if (!nets.ContainsKey(p.ToUserId)) nets[p.ToUserId] = 0;
            nets[p.FromUserId] += p.AmountCents; // debtor owes less
            nets[p.ToUserId] -= p.AmountCents; // creditor is owed less
        }

        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(string.Join('|', hashParts))));
        foreach (var id in nets.Keys)
            if (!users.ContainsKey(id)) users[id] = "Unknown";
        return new GroupNets(nets, users, rawDebts, hash, group.Currency);
    }

    public async Task<(SettlementPlan Plan, SettlementResult Result)> RecomputeAsync(Guid groupId)
    {
        var snapshot = await ComputeNetsAsync(groupId)
            ?? throw new InvalidOperationException("Group not found.");
        var result = SettlementService.Compute(snapshot.Nets, snapshot.Names, snapshot.Currency, snapshot.RawDebts);

        // Inputs unchanged vs the current plan -> reuse it instead of writing
        // another version (spec: versions track input changes, not page views;
        // this also removes the read-then-insert race for repeated GETs).
        var current = await LatestPlanAsync(groupId);
        if (current is not null && current.InputsHash == snapshot.InputsHash)
            return (current, result);

        var transfersJson = JsonSerializer.Serialize(result.Transfers.Select(t =>
            new { from_user_id = t.FromUserId, to_user_id = t.ToUserId, amount_cents = t.AmountCents }));
        var explanationJson = JsonSerializer.Serialize(new
        {
            steps = result.Steps,
            before_nets = result.NetsBefore.ToDictionary(kv => kv.Key.ToString(), kv => kv.Value),
            after_nets = result.NetsAfter.ToDictionary(kv => kv.Key.ToString(), kv => kv.Value),
            raw_debts = result.RawDebts,
            saved = result.Saved
        });

        // INSERT (MAX(VersionSeq)+1) races with concurrent recomputes for the
        // same group: the loser hits unique index IX_SettlementPlans_GroupId_VersionSeq
        // (SQL error 2601). Detach the failed entity and retry with a fresh MAX;
        // if the winner already recorded these exact inputs, return its plan.
        for (var attempt = 1; ; attempt++)
        {
            var nextSeq = await db.SettlementPlans.Where(s => s.GroupId == groupId)
                .Select(s => (int?)s.VersionSeq).MaxAsync() ?? 0;
            var plan = new SettlementPlan
            {
                GroupId = groupId,
                VersionSeq = nextSeq + 1,
                InputsHash = snapshot.InputsHash,
                TransfersJson = transfersJson,
                ExplanationJson = explanationJson
            };
            db.SettlementPlans.Add(plan);
            try
            {
                await db.SaveChangesAsync();
                return (plan, result);
            }
            catch (DbUpdateException ex) when (IsDuplicateKey(ex))
            {
                db.Entry(plan).State = EntityState.Detached;
                var winner = await LatestPlanAsync(groupId);
                if (winner is not null && winner.InputsHash == snapshot.InputsHash)
                    return (winner, result);
                if (attempt >= 4) throw;
            }
        }
    }

    private Task<SettlementPlan?> LatestPlanAsync(Guid groupId)
        => db.SettlementPlans
            .Where(s => s.GroupId == groupId)
            .OrderByDescending(s => s.VersionSeq)
            .FirstOrDefaultAsync();

    private static bool IsDuplicateKey(DbUpdateException ex)
    {
        if (ex.InnerException is Microsoft.Data.SqlClient.SqlException sql)
            return sql.Number is 2601 or 2627; // duplicate index key / unique constraint
        var msg = ex.InnerException?.Message ?? string.Empty;
        return msg.Contains("duplicate key", StringComparison.OrdinalIgnoreCase)   // Postgres
            || msg.Contains("UNIQUE constraint", StringComparison.OrdinalIgnoreCase); // SQLite
    }

    public sealed record LedgerFilters(string Type, string? Q, string? Status,
        long? MinAmount, long? MaxAmount, DateTime? FromDate, DateTime? ToDate,
        Guid? PayerId, string Sort, int Page, int Limit, string? Category = null);

    public sealed record LedgerItem(string Kind, Guid Id, string Title, DateTime CreatedAt,
        long AmountCents, Guid? PayerId, string? PayerName, Guid? FromUserId, string? FromName,
        Guid? ToUserId, string? ToName,
        long MyShareCents, string Status, bool HasImage, bool Reversed, string? Category = null,
        Guid? CreatedBy = null);

    public sealed record OweTo(Guid ToUserId, string ToName, long AmountCents);
    public sealed record OwedFrom(Guid FromUserId, string FromName, long AmountCents);
    public sealed record MeView(Guid GroupId, string Currency, long NetCents,
        List<OweTo> Owes, List<OwedFrom> OwedToMe, int SettlementVersion);
    public sealed record GroupRow(Guid GroupId, string Name, string Currency, long NetCents,
        bool Delinquent, DateTime? OldestUnsettledAt, DateTime CreatedAt,
        string? MyRole, int MemberCount, long SpentCents, bool NeedsSettlement = false,
        string Status = "opening");
    public sealed record CurrencyTotals(long OweCents, long OwedCents);
    public sealed record AllView(List<GroupRow> Groups, Dictionary<string, CurrencyTotals> Totals);
    public sealed record MemberSummary(Guid UserId, string DisplayName,
        long TotalPaidCents, long TotalShareCents, long NetCents, long OweCents);

    /// <summary>
    /// Per-member aggregates: total paid and total share across all non-deleted
    /// expenses (any status — locked history still counts), plus the current
    /// net debt (OPEN ledger only, same basis as settlement).
    /// </summary>
    public async Task<List<MemberSummary>?> BuildSummaryAsync(Guid groupId)
    {
        var group = await db.Groups.FindAsync(groupId);
        if (group is null || group.DeletedAt is not null) return null;

        var expenses = await db.Expenses
            .Where(e => e.GroupId == groupId && e.DeletedAt == null)
            .Include(e => e.Splits).ToListAsync();
        var snapshot = await ComputeNetsAsync(groupId);

        var ids = new HashSet<Guid>(await db.GroupMembers.Where(m => m.GroupId == groupId)
            .Select(m => m.UserId).ToListAsync());
        foreach (var e in expenses)
        {
            ids.Add(e.PayerId);
            foreach (var s in e.Splits) ids.Add(s.UserId);
        }
        var names = await db.Users.Where(u => ids.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.DisplayName);

        return ids
            .Select(id => new MemberSummary(
                id,
                names.TryGetValue(id, out var n) ? n : "Unknown",
                expenses.Where(e => e.PayerId == id).Sum(e => e.AmountCents),
                expenses.SelectMany(e => e.Splits).Where(s => s.UserId == id).Sum(s => s.ShareCents),
                snapshot?.Nets.TryGetValue(id, out var net) == true ? net : 0L,
                snapshot?.Nets.TryGetValue(id, out var net2) == true && net2 < 0 ? -net2 : 0L))
            .OrderBy(m => m.DisplayName, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    /// <summary>
    /// Unified expense+payment ledger. Removed members see a snapshot up to
    /// removal plus their own payments (spec task 7.1).
    /// </summary>
    public async Task<(List<LedgerItem> Items, int Total)> GetLedgerAsync(
        Guid groupId, Guid requesterId, LedgerFilters f)
    {
        var member = await db.GroupMembers.FindAsync(groupId, requesterId);
        var archive = await db.MembershipArchives.FindAsync(groupId, requesterId);
        if (member is null && archive is null)
            throw new InvalidOperationException("Not a group member.");
        var cutoff = member is null ? archive!.RemovedAt : (DateTime?)null;

        var userIds = await db.GroupMembers.Where(m => m.GroupId == groupId)
            .Select(m => m.UserId).ToListAsync();
        var archivedIds = await db.MembershipArchives.Where(a => a.GroupId == groupId)
            .Select(a => a.UserId).ToListAsync();
        var names = await db.Users
            .Where(u => userIds.Contains(u.Id) || archivedIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.DisplayName);

        var rows = new List<(DateTime At, LedgerItem Row)>();
        if (f.Type is "all" or "expense")
        {
            var q = db.Expenses
                .Where(e => e.GroupId == groupId && e.DeletedAt == null)
                .Include(e => e.Splits).Include(e => e.Images).AsEnumerable();
            if (cutoff is not null) q = q.Where(e => e.CreatedAt <= cutoff);
            if (f.Status is not null && Enum.TryParse<ExpenseStatus>(f.Status, true, out var st))
                q = q.Where(e => e.Status == st);
            if (f.MinAmount is not null) q = q.Where(e => e.AmountCents >= f.MinAmount);
            if (f.MaxAmount is not null) q = q.Where(e => e.AmountCents <= f.MaxAmount);
            if (f.FromDate is not null) q = q.Where(e => e.CreatedAt >= f.FromDate);
            if (f.ToDate is not null) q = q.Where(e => e.CreatedAt <= f.ToDate);
            if (f.PayerId is not null) q = q.Where(e => e.PayerId == f.PayerId);
            if (!string.IsNullOrWhiteSpace(f.Category))
            {
                var c = f.Category.Trim().ToLowerInvariant();
                q = q.Where(e => e.Category == c);
            }
            if (!string.IsNullOrWhiteSpace(f.Q))
            {
                var s = f.Q.ToLower();
                q = q.Where(e => e.Title.ToLower().Contains(s)
                    || (e.Description != null && e.Description.ToLower().Contains(s))
                    || NameOf(names, e.PayerId).ToLower().Contains(s));
            }
            foreach (var e in q)
            {
                rows.Add((e.CreatedAt, new LedgerItem(
                    "expense", e.Id, e.Title, e.CreatedAt, e.AmountCents,
                    e.PayerId, NameOf(names, e.PayerId), null, null, null, null,
                    e.Splits.FirstOrDefault(s => s.UserId == requesterId)?.ShareCents ?? 0L,
                    e.Status.ToString().ToUpperInvariant(), e.Images.Count > 0, false, e.Category,
                    e.CreatedBy)));
            }
        }
        if (f.Type is "all" or "payment")
        {
            var q = db.Payments.Where(p => p.GroupId == groupId).AsEnumerable();
            if (cutoff is not null)
                q = q.Where(p => p.FromUserId == requesterId || p.ToUserId == requesterId || p.CreatedAt <= cutoff);
            if (f.Status is not null && Enum.TryParse<ExpenseStatus>(f.Status, true, out var st))
                q = q.Where(p => p.Status == st);
            if (f.MinAmount is not null) q = q.Where(p => p.AmountCents >= f.MinAmount);
            if (f.MaxAmount is not null) q = q.Where(p => p.AmountCents <= f.MaxAmount);
            if (f.FromDate is not null) q = q.Where(p => p.CreatedAt >= f.FromDate);
            if (f.ToDate is not null) q = q.Where(p => p.CreatedAt <= f.ToDate);
            if (!string.IsNullOrWhiteSpace(f.Q))
            {
                var s = f.Q.ToLower();
                q = q.Where(p => (p.Note != null && p.Note.ToLower().Contains(s))
                    || NameOf(names, p.FromUserId).ToLower().Contains(s)
                    || NameOf(names, p.ToUserId).ToLower().Contains(s));
            }
            foreach (var p in q)
            {
                rows.Add((p.CreatedAt, new LedgerItem(
                    "payment", p.Id,
                    $"Payment {NameOf(names, p.FromUserId)} → {NameOf(names, p.ToUserId)}",
                    p.CreatedAt, p.AmountCents, null, null,
                    p.FromUserId, NameOf(names, p.FromUserId),
                    p.ToUserId, NameOf(names, p.ToUserId),
                    p.ToUserId == requesterId ? p.AmountCents
                        : p.FromUserId == requesterId ? -p.AmountCents : 0L,
                    p.Status.ToString().ToUpperInvariant(), false, p.ReversedAt is not null, null)));
            }
        }
        var ordered = f.Sort == "created_at"
            ? rows.OrderBy(r => r.At).ToList()
            : rows.OrderByDescending(r => r.At).ToList();
        var total = ordered.Count;
        var page = ordered.Skip((f.Page - 1) * f.Limit).Take(f.Limit).Select(r => r.Row).ToList();
        return (page, total);
    }

    private static string NameOf(Dictionary<Guid, string> names, Guid id)
        => names.TryGetValue(id, out var n) ? n : "Unknown";

    /// <summary>Per-group personal view: net + owes/owed-to from current transfers (task 7.2).</summary>
    public async Task<MeView?> BuildMeAsync(Guid groupId, Guid userId)
    {
        var snapshot = await ComputeNetsAsync(groupId);
        if (snapshot is null) return null;
        if (!snapshot.Nets.ContainsKey(userId)
            && await db.GroupMembers.FindAsync(groupId, userId) is null
            && await db.MembershipArchives.FindAsync(groupId, userId) is null)
            return null;
        var result = SettlementService.Compute(snapshot.Nets, snapshot.Names, snapshot.Currency, snapshot.RawDebts);
        var version = await db.SettlementPlans.Where(s => s.GroupId == groupId)
            .Select(s => (int?)s.VersionSeq).MaxAsync() ?? 0;
        string Name(Guid id) => snapshot.Names.TryGetValue(id, out var n) ? n : "Unknown";
        return new MeView(groupId, snapshot.Currency,
            snapshot.Nets.TryGetValue(userId, out var net) ? net : 0L,
            result.Transfers.Where(t => t.FromUserId == userId)
                .Select(t => new OweTo(t.ToUserId, Name(t.ToUserId), t.AmountCents)).ToList(),
            result.Transfers.Where(t => t.ToUserId == userId)
                .Select(t => new OwedFrom(t.FromUserId, Name(t.FromUserId), t.AmountCents)).ToList(),
            version);
    }

    /// <summary>All-groups dashboard grouped by currency, never summed across (task 7.2).</summary>
    public async Task<AllView> BuildAllAsync(Guid userId)
    {
        var memberships = await db.GroupMembers.Where(m => m.UserId == userId)
            .Select(m => new { m.GroupId, m.Role }).ToListAsync();
        var groupIds = memberships.Select(m => m.GroupId).ToList();
        var myRoles = memberships.ToDictionary(m => m.GroupId, m => m.Role);
        var memberCounts = await db.GroupMembers.Where(m => groupIds.Contains(m.GroupId))
            .GroupBy(m => m.GroupId)
            .Select(g => new { GroupId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.GroupId, x => x.Count);
        var spentByGroup = await db.Expenses
            .Where(e => groupIds.Contains(e.GroupId) && e.DeletedAt == null)
            .GroupBy(e => e.GroupId)
            .Select(g => new { GroupId = g.Key, Spent = g.Sum(e => e.AmountCents) })
            .ToDictionaryAsync(x => x.GroupId, x => x.Spent);
        var groups = await db.Groups.Where(g => groupIds.Contains(g.Id) && g.DeletedAt == null).ToListAsync();
        var rows = new List<GroupRow>();
        var totals = new Dictionary<string, CurrencyTotals>();
        foreach (var g in groups)
        {
            var snapshot = await ComputeNetsAsync(g.Id);
            if (snapshot is null) continue;
            var net = snapshot.Nets.TryGetValue(userId, out var n) ? n : 0L;
            var needsSettlement = snapshot.Nets.Values.Any(v => v != 0);
            var oldest = await db.Expenses
                .Where(e => e.GroupId == g.Id && e.Status == ExpenseStatus.Open && e.DeletedAt == null)
                .Select(e => (DateTime?)e.CreatedAt).MinAsync()
                ?? await db.Payments
                    .Where(p => p.GroupId == g.Id && p.Status == ExpenseStatus.Open && p.ReversedAt == null)
                    .Select(p => (DateTime?)p.CreatedAt).MinAsync();
            var delinquent = needsSettlement && oldest is not null && DateTime.UtcNow - oldest > TimeSpan.FromDays(30);
            myRoles.TryGetValue(g.Id, out var myRole);
            memberCounts.TryGetValue(g.Id, out var memberCount);
            spentByGroup.TryGetValue(g.Id, out var spentCents);
            rows.Add(new GroupRow(g.Id, g.Name, g.Currency, net, delinquent,
                needsSettlement ? oldest : null, g.CreatedAt,
                myRole, memberCount, spentCents, needsSettlement, g.Status));
            totals.TryGetValue(g.Currency, out var t);
            totals[g.Currency] = net < 0
                ? new CurrencyTotals(t?.OweCents - net ?? -net, t?.OwedCents ?? 0)
                : new CurrencyTotals(t?.OweCents ?? 0, t?.OwedCents + net ?? net);
        }
        return new AllView(rows, totals);
    }
}
