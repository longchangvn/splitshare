namespace SplitShare.Api.Notifications;

/// <summary>Vendor-neutral push payload (design decision: keep providers swappable).</summary>
public sealed record NotificationMessage(string Title, string Body, string? Url = null, Guid? GroupId = null);

/// <summary>
/// Push notification provider strategy: one implementation per vendor, selected
/// by <c>Notification:Provider</c> config — the same switchable-provider pattern
/// as <c>IDatabaseProvider</c> and <c>IEmailSender</c>. Callers target SplitShare
/// user GUIDs; how those map to device subscriptions is the provider's concern.
/// </summary>
public interface INotificationProvider
{
    /// <summary>Best-effort send to the given users. Implementations log and
    /// swallow transport errors so a push failure never fails a money operation.</summary>
    Task SendToUsersAsync(IReadOnlyCollection<Guid> userIds, NotificationMessage message, CancellationToken ct = default);
}
