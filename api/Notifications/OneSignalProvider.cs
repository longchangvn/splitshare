using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace SplitShare.Api.Notifications;

/// <summary>
/// OneSignal REST sender (https://api.onesignal.com/notifications). Targets
/// users by external-ID alias — the user's GUID, set client-side via
/// <c>OneSignal.login(user_id)</c> — so no device-token storage is needed.
/// Best-effort: transport/API failures are logged, never thrown to callers.
/// </summary>
public sealed class OneSignalProvider(
    IHttpClientFactory httpClientFactory,
    IConfiguration config,
    ILogger<OneSignalProvider> logger) : INotificationProvider
{
    public const string HttpClientName = "onesignal";

    private static readonly JsonSerializerOptions Json = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull // omit url/data when absent
    };

    public async Task SendToUsersAsync(IReadOnlyCollection<Guid> userIds, NotificationMessage message, CancellationToken ct = default)
    {
        if (userIds.Count == 0) return;
        var appId = config["Notification:OneSignal:AppId"];
        var apiKey = config["Notification:OneSignal:ApiKey"];
        if (string.IsNullOrWhiteSpace(appId) || string.IsNullOrWhiteSpace(apiKey))
        {
            logger.LogWarning("OneSignal not configured (Notification:OneSignal:AppId / :ApiKey); skipping notification.");
            return;
        }

        var payload = new
        {
            app_id = appId,
            target_channel = "push",
            include_aliases = new { external_id = userIds.Select(id => id.ToString("D")).ToArray() },
            headings = new { en = message.Title },
            contents = new { en = message.Body },
            url = message.Url,
            data = message.GroupId is { } gid ? new { group_id = gid.ToString("D") } : null
        };

        // Endpoint override exists for tests/e2e capture; defaults to the real API.
        var endpoint = config["Notification:OneSignal:Endpoint"]
            ?? "https://api.onesignal.com/notifications";
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, endpoint)
            {
                Content = JsonContent.Create(payload, options: Json)
            };
            req.Headers.TryAddWithoutValidation("Authorization", $"Key {apiKey}");
            using var res = await httpClientFactory.CreateClient(HttpClientName).SendAsync(req, ct);
            var body = await res.Content.ReadAsStringAsync(ct);
            if (!res.IsSuccessStatusCode)
            {
                logger.LogWarning("OneSignal send failed: {Status} {Body}", (int)res.StatusCode, body);
                return;
            }
            // 200 without "id" = valid request but no subscribed recipients (all logged out etc.).
            logger.LogInformation("OneSignal notification accepted: {Body}", body);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "OneSignal send failed (best-effort, suppressed).");
        }
    }
}
