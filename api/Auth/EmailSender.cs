using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging.Abstractions;

namespace SplitShare.Api.Auth;

public enum EmailSendStatus { Sent, Failed, NotConfigured }

/// <summary>
/// Outcome of one send. <see cref="EmailSendStatus.Sent"/> only when the provider
/// accepted the message and returned a message id; anything else carries a reason.
/// </summary>
public sealed record EmailSendResult(EmailSendStatus Status, string? MessageId = null, string? Error = null)
{
    public bool Sent => Status == EmailSendStatus.Sent;
    public static EmailSendResult Accepted(string messageId) => new(EmailSendStatus.Sent, messageId);
    public static EmailSendResult Fail(string error) => new(EmailSendStatus.Failed, null, error);
    public static EmailSendResult Unconfigured(string error) => new(EmailSendStatus.NotConfigured, null, error);
}

/// <summary>
/// Outbound email. <paramref name="transactional"/> marks mail that must reach the
/// user even if they unsubscribed from non-essential mail: account-critical mail
/// (verify, password reset) and group invites. Nudges and alerts stay non-essential. Never throws: the result
/// says whether the provider accepted the message.
/// </summary>
public interface IEmailSender
{
    Task<EmailSendResult> SendAsync(string to, string subject, string body, bool transactional = false);
}

/// <summary>Dev stub: logs emails (default when <c>Email:Provider</c> is unset). Nothing is delivered.</summary>
public sealed class StubEmailSender(ILogger<StubEmailSender> logger) : IEmailSender
{
    public Task<EmailSendResult> SendAsync(string to, string subject, string body, bool transactional = false)
    {
        logger.LogInformation("EMAIL to={To} subject={Subject} body={Body}", to, subject, body);
        return Task.FromResult(EmailSendResult.Unconfigured("Email provider not configured; the email was only logged."));
    }
}

/// <summary>
/// OneSignal email channel (<c>POST https://api.onesignal.com/notifications</c>,
/// <c>target_channel: "email"</c>, <c>email_to</c>). Credentials come from
/// <c>Email:OneSignal:AppId/ApiKey</c>, falling back to the push credentials
/// <c>Notification:OneSignal:*</c> (same OneSignal app). Failures are logged
/// (without recipient or body — bodies carry tokens) and returned, never thrown.
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

    public async Task<EmailSendResult> SendAsync(string to, string subject, string body, bool transactional = false)
    {
        var appId = config["Email:OneSignal:AppId"] ?? config["Notification:OneSignal:AppId"];
        var apiKey = config["Email:OneSignal:ApiKey"] ?? config["Notification:OneSignal:ApiKey"];
        if (string.IsNullOrWhiteSpace(appId) || string.IsNullOrWhiteSpace(apiKey))
        {
            logger.LogWarning("OneSignal email not configured (Email:OneSignal:AppId / :ApiKey); skipping email.");
            return EmailSendResult.Unconfigured("Email provider credentials are not configured.");
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
                return EmailSendResult.Fail($"Email provider rejected the message (HTTP {(int)res.StatusCode}){ErrorSuffix(resBody)}");
            }
            // 200 without a message "id" = valid request but nothing was sent (e.g. email channel not set up).
            var messageId = MessageId(resBody);
            if (messageId is null)
            {
                logger.LogWarning("OneSignal email not sent: {Body}", resBody);
                return EmailSendResult.Fail($"Email provider did not send the message{ErrorSuffix(resBody)}");
            }
            logger.LogInformation("OneSignal email accepted (subject={Subject}): {Body}", subject, resBody);
            return EmailSendResult.Accepted(messageId);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "OneSignal email send failed.");
            return EmailSendResult.Fail("Email provider unreachable.");
        }
    }

    private static string? MessageId(string body)
    {
        try
        {
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            return root.ValueKind == JsonValueKind.Object && !root.TryGetProperty("errors", out _)
                && root.TryGetProperty("id", out var id) && id.ValueKind == JsonValueKind.String
                && id.GetString()!.Length > 0 ? id.GetString() : null;
        }
        catch (JsonException) { return null; }
    }

    /// <summary>": first provider error" (bounded), or empty when the body has none.</summary>
    private static string ErrorSuffix(string body)
    {
        try
        {
            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.ValueKind != JsonValueKind.Object
                || !doc.RootElement.TryGetProperty("errors", out var errors)) return ".";
            var first = errors.ValueKind switch
            {
                JsonValueKind.Array => errors.EnumerateArray().Select(e => e.ToString()).FirstOrDefault(),
                JsonValueKind.Object => errors.EnumerateObject().Select(p => p.Name).FirstOrDefault(),
                _ => errors.ToString()
            };
            if (string.IsNullOrWhiteSpace(first)) return ".";
            // OneSignal's wording when every recipient's email subscription is unsubscribed
            // (unsubscribe link, bounce or spam report): non-essential mail skips them.
            if (first.Contains("not subscribed", StringComparison.OrdinalIgnoreCase))
                return ": the recipient is unsubscribed from SplitShare emails.";
            return $": {first[..Math.Min(160, first.Length)]}";
        }
        catch (JsonException) { return "."; }
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
