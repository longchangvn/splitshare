using Microsoft.EntityFrameworkCore;
using SplitShare.Api.Data;
using SplitShare.Api.Services;

namespace SplitShare.Api.Notifications;

/// <summary>
/// Best-effort group fan-out: push to all current members except the actor.
/// Never throws — a push failure must not fail the money operation (the same
/// contract as the budget-alert email in <c>ExpenseService</c>). The provider
/// itself also swallows transport errors; this try/catch additionally covers
/// the recipient query and any third-party provider that throws.
/// </summary>
public sealed class GroupNotifier(
    AppDbContext db,
    INotificationProvider provider,
    IConfiguration config,
    ILogger<GroupNotifier> logger)
{
    public Task NotifyExpenseAsync(Guid groupId, Guid actorId, string expenseTitle, long amountCents, string currency)
        => NotifyAsync(groupId, actorId, action: "added an expense",
            body: $"{expenseTitle} · {SettlementService.Fmt(amountCents, currency)}");

    public Task NotifyPaymentAsync(Guid groupId, Guid actorId, long amountCents, string currency)
        => NotifyAsync(groupId, actorId, action: "recorded a payment",
            body: SettlementService.Fmt(amountCents, currency));

    private async Task NotifyAsync(Guid groupId, Guid actorId, string action, string body)
    {
        try
        {
            var targets = await db.GroupMembers
                .Where(m => m.GroupId == groupId)
                .Select(m => m.UserId)
                .ToListAsync();
            targets.Remove(actorId); // never self-notify
            if (targets.Count == 0) return;
            var actorName = await db.Users.Where(u => u.Id == actorId)
                .Select(u => u.DisplayName).FirstOrDefaultAsync();
            var baseUrl = (config["App:BaseUrl"] ?? "").TrimEnd('/');
            var url = baseUrl.Length > 0 ? $"{baseUrl}/groups/{groupId}" : null;
            await provider.SendToUsersAsync(targets,
                new NotificationMessage($"{actorName ?? "Someone"} {action}", body, url, groupId));
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Push notification failed for group {GroupId} (best-effort, suppressed).", groupId);
        }
    }
}
