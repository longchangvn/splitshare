using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using SplitShare.Api.Data;

namespace SplitShare.Api.Notifications;

/// <summary>
/// Selects the push provider from <c>Notification:Provider</c> config — same
/// shape as <c>DatabaseProviderFactory</c>: empty → null provider (default),
/// "onesignal" → OneSignal (external_id aliases), "expo" → Expo push tokens
/// stored per device, anything else → startup error.
/// </summary>
public static class NotificationProviderFactory
{
    public static INotificationProvider Create(IConfiguration config, IHttpClientFactory? httpClientFactory = null,
        ILogger<OneSignalProvider>? oneSignalLogger = null, ILogger<NullNotificationProvider>? nullLogger = null,
        ILogger<ExpoPushProvider>? expoLogger = null, AppDbContext? db = null)
    {
        var raw = config["Notification:Provider"]?.Trim();
        if (string.IsNullOrEmpty(raw))
            return new NullNotificationProvider(nullLogger ?? NullLogger<NullNotificationProvider>.Instance); // default: no push
        return raw.ToLowerInvariant() switch
        {
            "onesignal" => httpClientFactory is null
                ? throw new InvalidOperationException(
                    "Notification:Provider 'onesignal' requires an IHttpClientFactory (register the named HttpClient first).")
                : new OneSignalProvider(httpClientFactory, config, oneSignalLogger ?? NullLogger<OneSignalProvider>.Instance),
            "expo" => httpClientFactory is null || db is null
                ? throw new InvalidOperationException(
                    "Notification:Provider 'expo' requires an IHttpClientFactory and a scoped AppDbContext.")
                : new ExpoPushProvider(httpClientFactory, db, config,
                    expoLogger ?? NullLogger<ExpoPushProvider>.Instance),
            _ => throw new InvalidOperationException(
                $"Unknown Notification:Provider '{raw}'. Valid values: onesignal, expo (or unset for none).")
        };
    }
}
