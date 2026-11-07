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
            if (doc.RootElement.ValueKind != JsonValueKind.Object) return ".";
            // OneSignal answers 200 + "not subscribed" when the app has no Email channel;
            // only the warning names the real cause.
            if (doc.RootElement.TryGetProperty("warnings", out var warnings)
                && warnings.ToString().Contains("configure Email", StringComparison.OrdinalIgnoreCase))
                return ": the OneSignal app has no Email channel configured (OneSignal dashboard → Settings → Email).";
            if (!doc.RootElement.TryGetProperty("errors", out var errors)) return ".";
            var first = errors.ValueKind switch
            {
                JsonValueKind.Array => errors.EnumerateArray().Select(e => e.ToString()).FirstOrDefault(),
                JsonValueKind.Object => errors.EnumerateObject().Select(p => p.Name).FirstOrDefault(),
                _ => errors.ToString()
            };
            if (string.IsNullOrWhiteSpace(first)) return ".";
            // Otherwise OneSignal found no deliverable email subscription for the address.
            if (first.Contains("not subscribed", StringComparison.OrdinalIgnoreCase))
                return ": no deliverable email subscription for the recipient in OneSignal.";
            return $": {first[..Math.Min(160, first.Length)]}";
        }
        catch (JsonException) { return "."; }
    }

    private static string? NullIfBlank(string? v) => string.IsNullOrWhiteSpace(v) ? null : v;
}

/// <summary>
/// Twilio SendGrid Mail Send v3 (<c>POST https://api.sendgrid.com/v3/mail/send</c>,
/// <c>Authorization: Bearer &lt;SendGrid API key&gt;</c>). Twilio email is only sendable
/// with a SendGrid API key — the Twilio Account SID / Auth Token do not authenticate
/// this API. Key from <c>Email:Twilio:ApiKey</c> (env <c>Email__Twilio__ApiKey</c>);
/// <c>Email:FromAddress</c> must be a SendGrid-verified sender. 202 + <c>X-Message-Id</c>
/// = accepted. Failures are logged (without recipient or body) and returned, never thrown.
/// </summary>
public sealed class TwilioSendGridEmailSender(
    IHttpClientFactory httpClientFactory,
    IConfiguration config,
    ILogger<TwilioSendGridEmailSender> logger) : IEmailSender
{
    public const string HttpClientName = "twilio-sendgrid-email";
    public const string DefaultEndpoint = "https://api.sendgrid.com/v3/mail/send";

    private static readonly JsonSerializerOptions Json = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    public async Task<EmailSendResult> SendAsync(string to, string subject, string body, bool transactional = false)
    {
        var apiKey = config["Email:Twilio:ApiKey"];
        var fromAddress = config["Email:FromAddress"];
        if (string.IsNullOrWhiteSpace(apiKey) || string.IsNullOrWhiteSpace(fromAddress))
        {
            logger.LogWarning("Twilio SendGrid email not configured (Email:Twilio:ApiKey / Email:FromAddress); skipping email.");
            return EmailSendResult.Unconfigured("Email provider credentials are not configured.");
        }

        var payload = new
        {
            personalizations = new[] { new { to = new[] { new { email = to } } } },
            from = new { email = fromAddress.Trim(), name = NullIfBlank(config["Email:FromName"]) },
            subject,
            content = new[]
            {
                new { type = "text/plain", value = body },
                new { type = "text/html", value = OneSignalEmailSender.ToHtml(body) }
            },
            // Account-critical mail must reach users who unsubscribed from non-essential mail.
            mail_settings = transactional
                ? new { bypass_unsubscribe_management = new { enable = true } }
                : null,
            // Links carry single-use tokens: keep them out of click-tracking redirects.
            tracking_settings = new { click_tracking = new { enable = false, enable_text = false } }
        };

        var endpoint = NullIfBlank(config["Email:Twilio:Endpoint"]) ?? DefaultEndpoint;
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, endpoint)
            {
                Content = JsonContent.Create(payload, options: Json)
            };
            req.Headers.TryAddWithoutValidation("Authorization", $"Bearer {apiKey.Trim()}");
            using var res = await httpClientFactory.CreateClient(HttpClientName).SendAsync(req);
            if (!res.IsSuccessStatusCode)
            {
                var resBody = await res.Content.ReadAsStringAsync();
                logger.LogWarning("Twilio SendGrid email send failed: {Status} {Body}", (int)res.StatusCode, resBody);
                return EmailSendResult.Fail($"Email provider rejected the message (HTTP {(int)res.StatusCode}){ErrorSuffix(resBody)}");
            }
            var messageId = res.Headers.TryGetValues("X-Message-Id", out var ids) ? ids.FirstOrDefault() : null;
            if (string.IsNullOrWhiteSpace(messageId))
            {
                logger.LogWarning("Twilio SendGrid email: HTTP {Status} without X-Message-Id.", (int)res.StatusCode);
                return EmailSendResult.Fail("Email provider did not send the message.");
            }
            logger.LogInformation("Twilio SendGrid email accepted (subject={Subject}, id={MessageId}).", subject, messageId);
            return EmailSendResult.Accepted(messageId);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Twilio SendGrid email send failed.");
            return EmailSendResult.Fail("Email provider unreachable.");
        }
    }

    /// <summary>": first SendGrid error message" (bounded), or "." when the body has none.</summary>
    private static string ErrorSuffix(string body)
    {
        try
        {
            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.ValueKind != JsonValueKind.Object
                || !doc.RootElement.TryGetProperty("errors", out var errors)
                || errors.ValueKind != JsonValueKind.Array) return ".";
            var first = errors.EnumerateArray()
                .Select(e => e.ValueKind == JsonValueKind.Object && e.TryGetProperty("message", out var m) ? m.GetString() : e.ToString())
                .FirstOrDefault();
            return string.IsNullOrWhiteSpace(first) ? "." : $": {first[..Math.Min(160, first.Length)]}";
        }
        catch (JsonException) { return "."; }
    }

    private static string? NullIfBlank(string? v) => string.IsNullOrWhiteSpace(v) ? null : v;
}

/// <summary>
/// Selects the email sender from <c>Email:Provider</c>: empty → <see cref="StubEmailSender"/>
/// (logs only), "sendgrid"/"twilio" → <see cref="TwilioSendGridEmailSender"/> (primary, the
/// appsettings default), "onesignal" → <see cref="OneSignalEmailSender"/>, anything else → startup error.
/// </summary>
public static class EmailSenderFactory
{
    public static IEmailSender Create(IConfiguration config, IHttpClientFactory? httpClientFactory = null,
        ILogger<OneSignalEmailSender>? oneSignalLogger = null, ILogger<StubEmailSender>? stubLogger = null,
        ILogger<TwilioSendGridEmailSender>? twilioLogger = null)
    {
        var raw = config["Email:Provider"]?.Trim();
        if (string.IsNullOrEmpty(raw))
            return new StubEmailSender(stubLogger ?? NullLogger<StubEmailSender>.Instance);
        var provider = raw.ToLowerInvariant();
        if (provider is not ("twilio" or "sendgrid" or "onesignal"))
            throw new InvalidOperationException(
                $"Unknown Email:Provider '{raw}'. Valid values: sendgrid, twilio, onesignal (or unset for the logging stub).");
        if (httpClientFactory is null)
            throw new InvalidOperationException(
                $"Email:Provider '{raw}' requires an IHttpClientFactory (register the named HttpClient first).");
        return provider == "onesignal"
            ? new OneSignalEmailSender(httpClientFactory, config, oneSignalLogger ?? NullLogger<OneSignalEmailSender>.Instance)
            : new TwilioSendGridEmailSender(httpClientFactory, config, twilioLogger ?? NullLogger<TwilioSendGridEmailSender>.Instance);
    }
}
