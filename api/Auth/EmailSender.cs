using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging.Abstractions;

namespace SplitShare.Api.Auth;

/// <summary>
/// Outbound email. <paramref name="transactional"/> marks account-critical mail
/// (verify, password reset) that must reach the user even if they unsubscribed
/// from non-essential mail (invites, nudges, alerts).
/// </summary>
public interface IEmailSender
{
    Task SendAsync(string to, string subject, string body, bool transactional = false);
}

/// <summary>Dev stub: logs emails (default when <c>Email:Provider</c> is unset).</summary>
public sealed class StubEmailSender(ILogger<StubEmailSender> logger) : IEmailSender
{
    public Task SendAsync(string to, string subject, string body, bool transactional = false)
    {
        logger.LogInformation("EMAIL to={To} subject={Subject} body={Body}", to, subject, body);
        return Task.CompletedTask;
    }
}

/// <summary>
/// OneSignal email channel (<c>POST https://api.onesignal.com/notifications</c>,
/// <c>target_channel: "email"</c>, <c>email_to</c>). Credentials come from
/// <c>Email:OneSignal:AppId/ApiKey</c>, falling back to the push credentials
/// <c>Notification:OneSignal:*</c> (same OneSignal app). Best-effort: failures
/// are logged (without recipient or body — bodies carry tokens), never thrown.
/// </summary>
public sealed partial class OneSignalEmailSender(
    IHttpClientFactory httpClientFactory,
    IConfiguration config,
    ILogger<OneSignalEmailSender> logger) : IEmailSender
{
    public const string HttpClientName = "onesignal-email";

    private static readonly JsonSerializerOptions Json = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    [GeneratedRegex(@"https?://[^\s<>""]+")]
    private static partial Regex UrlRe();

    /// <summary>Plain-text body → minimal HTML: encoded, line breaks kept, URLs clickable.</summary>
    public static string ToHtml(string body)
    {
        var html = UrlRe().Replace(WebUtility.HtmlEncode(body), m => $"<a href=\"{m.Value}\">{m.Value}</a>");
        return $"<div style=\"font-family:sans-serif;font-size:14px;line-height:1.5\">{html.Replace("\n", "<br>")}</div>";
    }

    public async Task SendAsync(string to, string subject, string body, bool transactional = false)
    {
        var appId = config["Email:OneSignal:AppId"] ?? config["Notification:OneSignal:AppId"];
        var apiKey = config["Email:OneSignal:ApiKey"] ?? config["Notification:OneSignal:ApiKey"];
        if (string.IsNullOrWhiteSpace(appId) || string.IsNullOrWhiteSpace(apiKey))
        {
            logger.LogWarning("OneSignal email not configured (Email:OneSignal:AppId / :ApiKey); skipping email.");
            return;
        }

        var payload = new
        {
            app_id = appId,
            target_channel = "email",
            email_to = new[] { to },
            email_subject = subject,
            email_body = ToHtml(body),
            email_from_name = NullIfBlank(config["Email:FromName"]),
            email_from_address = NullIfBlank(config["Email:FromAddress"]),
            include_unsubscribed = transactional ? true : (bool?)null,
            // Links carry single-use tokens: keep them out of click-tracking redirects.
            disable_email_click_tracking = true
        };

        var endpoint = config["Email:OneSignal:Endpoint"] ?? "https://api.onesignal.com/notifications?c=email";
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, endpoint)
            {
                Content = JsonContent.Create(payload, options: Json)
            };
            req.Headers.TryAddWithoutValidation("Authorization", $"Key {apiKey}");
            using var res = await httpClientFactory.CreateClient(HttpClientName).SendAsync(req);
            var resBody = await res.Content.ReadAsStringAsync();
            if (!res.IsSuccessStatusCode)
            {
                logger.LogWarning("OneSignal email send failed: {Status} {Body}", (int)res.StatusCode, resBody);
                return;
            }
            // 200 without a message "id" = valid request but nothing was sent (e.g. email channel not set up).
            if (!HasMessageId(resBody))
            {
                logger.LogWarning("OneSignal email not sent: {Body}", resBody);
                return;
            }
            logger.LogInformation("OneSignal email accepted (subject={Subject}): {Body}", subject, resBody);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "OneSignal email send failed (best-effort, suppressed).");
        }
    }

    private static bool HasMessageId(string body)
    {
        try
        {
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            return root.ValueKind == JsonValueKind.Object && !root.TryGetProperty("errors", out _)
                && root.TryGetProperty("id", out var id) && id.ValueKind == JsonValueKind.String
                && id.GetString()!.Length > 0;
        }
        catch (JsonException) { return false; }
    }

    private static string? NullIfBlank(string? v) => string.IsNullOrWhiteSpace(v) ? null : v;
}

/// <summary>
/// Selects the email sender from <c>Email:Provider</c>: empty → <see cref="StubEmailSender"/>
/// (logs only), "onesignal" → <see cref="OneSignalEmailSender"/>, anything else → startup error.
/// </summary>
public static class EmailSenderFactory
{
    public static IEmailSender Create(IConfiguration config, IHttpClientFactory? httpClientFactory = null,
        ILogger<OneSignalEmailSender>? oneSignalLogger = null, ILogger<StubEmailSender>? stubLogger = null)
    {
        var raw = config["Email:Provider"]?.Trim();
        if (string.IsNullOrEmpty(raw))
            return new StubEmailSender(stubLogger ?? NullLogger<StubEmailSender>.Instance);
        return raw.ToLowerInvariant() switch
        {
            "onesignal" => httpClientFactory is null
                ? throw new InvalidOperationException(
                    "Email:Provider 'onesignal' requires an IHttpClientFactory (register the named HttpClient first).")
                : new OneSignalEmailSender(httpClientFactory, config, oneSignalLogger ?? NullLogger<OneSignalEmailSender>.Instance),
            _ => throw new InvalidOperationException(
                $"Unknown Email:Provider '{raw}'. Valid values: onesignal (or unset for the logging stub).")
        };
    }
}
