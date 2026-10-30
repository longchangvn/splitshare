using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SplitShare.Api.Data;

namespace SplitShare.Api.Notifications;

/// <summary>
/// Expo push sender (spec 005 D2). Unlike OneSignal, the routing key is the
/// Expo token stored per install, so this provider reads <c>PushDevices</c>,
/// skips devices that muted the group, and drops tokens Expo reports as
/// unregistered. Transport failures stay best-effort: a push never fails a
/// money operation.
/// </summary>
public sealed class ExpoPushProvider(
    IHttpClientFactory http,
    AppDbContext db,
    IConfiguration config,
    ILogger<ExpoPushProvider> logger) : INotificationProvider
{
    public const string HttpClientName = "expo-push";
    private const int MaxBatch = 100;

    public async Task SendToUsersAsync(
        IReadOnlyCollection<Guid> userIds, NotificationMessage message, CancellationToken ct = default)
    {
        if (userIds.Count == 0) return;
        try
        {
            var devices = await db.PushDevices
                .Where(d => userIds.Contains(d.UserId))
                .ToListAsync(ct);
            var targets = devices
                .Where(d => message.GroupId is null || !d.MutedGroupIds().Contains(message.GroupId.Value))
                .GroupBy(d => d.Token)
                .Select(g => g.First())
                .ToList();
            if (targets.Count == 0) return;

            var endpoint = config["Notification:Expo:Endpoint"]
                ?? "https://exp.host/--/api/v2/push/send";
            var accessToken = config["Notification:Expo:AccessToken"];
            var client = http.CreateClient(HttpClientName);
            var dead = new List<string>();

            foreach (var batch in targets.Chunk(MaxBatch))
            {
                var payload = batch.Select(d => new
                {
                    to = d.Token,
                    title = message.Title,
                    body = message.Body,
                    sound = "default",
                    channelId = "default",
                    data = new
                    {
                        group_id = message.GroupId?.ToString("D"),
                        url = message.Url
                    }
                }).ToList();

                using var req = new HttpRequestMessage(HttpMethod.Post, endpoint)
                {
                    Content = JsonContent.Create(payload)
                };
                if (!string.IsNullOrWhiteSpace(accessToken))
                    req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

                using var res = await client.SendAsync(req, ct);
                var body = await res.Content.ReadAsStringAsync(ct);
                if (!res.IsSuccessStatusCode)
                {
                    logger.LogWarning("Expo push failed: {Status} {Body}", (int)res.StatusCode, body);
                    continue;
                }

                // Tickets are returned in request order: DeviceNotRegistered means the
                // install is gone, so forget that token instead of retrying forever.
                try
                {
                    using var doc = JsonDocument.Parse(body);
                    if (!doc.RootElement.TryGetProperty("data", out var tickets)
                        || tickets.ValueKind != JsonValueKind.Array) continue;
                    var i = 0;
                    foreach (var ticket in tickets.EnumerateArray())
                    {
                        if (i >= batch.Length) break;
                        if (ticket.TryGetProperty("details", out var details)
                            && details.TryGetProperty("error", out var err)
                            && err.GetString() == "DeviceNotRegistered")
                            dead.Add(batch[i].Token);
                        i++;
                    }
                }
                catch (JsonException) { /* ticket shape is informative only */ }
            }

            if (dead.Count > 0)
            {
                var rows = await db.PushDevices.Where(d => dead.Contains(d.Token)).ToListAsync(ct);
                db.PushDevices.RemoveRange(rows);
                await db.SaveChangesAsync(ct);
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Expo push send failed (best-effort, suppressed).");
        }
    }
}
