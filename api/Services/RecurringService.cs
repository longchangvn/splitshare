using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SplitShare.Api.Data;
using SplitShare.Api.Expenses;
using SplitShare.Api.Models;

namespace SplitShare.Api.Services;

/// <summary>Recurring bills. Due rules materialize one expense per period, on read (no worker).</summary>
public sealed class RecurringService(AppDbContext db, ExpenseService expenses)
{
    public static bool ValidFrequency(string f) => f is "weekly" or "monthly";

    public static DateTime Advance(DateTime from, string freq)
        => freq == "weekly" ? from.AddDays(7) : from.AddMonths(1);

    public async Task<int> MaterializeDueAsync(Guid groupId)
    {
        var group = await db.Groups.FindAsync(groupId);
        if (group is null || group.DeletedAt is not null || group.Status != "opening")
            return 0;
        var now = DateTime.UtcNow;
        var rules = await db.RecurringRules
            .Where(r => r.GroupId == groupId && r.Active && r.NextRunAt <= now).ToListAsync();
        var made = 0;
        foreach (var r in rules)
        {
            var parts = JsonSerializer.Deserialize<List<Guid>>(r.ParticipantIdsJson) ?? [];
            var current = await db.GroupMembers.Where(m => m.GroupId == groupId).Select(m => m.UserId).ToListAsync();
            if (!current.Contains(r.PayerId) || parts.Count == 0 || parts.Any(p => !current.Contains(p)))
            {
                r.Active = false; // membership changed: park the rule instead of spamming
                continue;
            }
            if (!Enum.IsDefined(r.SplitType)) { r.Active = false; continue; }
            var res = await expenses.CreateAsync(r.CreatedBy, groupId, r.Title, "Recurring",
                r.AmountCents / 100m, r.PayerId, r.SplitType, parts, null, null, null);
            if (!res.Ok) { r.Active = false; continue; }
            r.LastRunAt = now;
            do { r.NextRunAt = Advance(r.NextRunAt, r.Frequency); }
            while (r.NextRunAt <= now); // catch up the cursor; only one expense per read
            made++;
        }
        if (made > 0) await db.SaveChangesAsync();
        else await db.SaveChangesAsync(); // persist parked rules / cursor moves
        return made;
    }
}
