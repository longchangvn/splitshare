namespace SplitShare.Api.Notifications;

/// <summary>Default: logging no-op, used when no provider is configured.</summary>
public sealed class NullNotificationProvider(ILogger<NullNotificationProvider> logger) : INotificationProvider
{
    public Task SendToUsersAsync(IReadOnlyCollection<Guid> userIds, NotificationMessage message, CancellationToken ct = default)
    {
        logger.LogInformation("NOTIFY (no provider) users={Users} title={Title} body={Body}",
            string.Join(',', userIds), message.Title, message.Body);
        return Task.CompletedTask;
    }
}
