using System.Text.RegularExpressions;
using SplitShare.Api.Auth;

namespace SplitShare.E2E;

/// <summary>One captured outbound email (the E2E stand-in for a real provider).</summary>
public sealed record CapturedEmail(string To, string Subject, string Body, bool Transactional);

/// <summary>
/// Test double for <see cref="IEmailSender"/>: records every message instead of
/// sending it, so happy-path flows that only ever deliver a code or link over
/// email (OTP sign-in, invitations, verify/reset) become assertable. Registered
/// by <see cref="E2eApiFactory"/> — the real provider is never constructed.
/// </summary>
/// <remarks>Subject needles that match <c>EmailTemplates</c>: sign-in code → "code",
/// verify code → "confirmation code", reset → "reset", verify link → "verify",
/// group invite → "invited you".</remarks>
public sealed class CapturingEmailSender : IEmailSender
{
    private static readonly Regex Url = new(@"https?://[^\s""'<>]+", RegexOptions.Compiled);
    private static readonly Regex SixDigits = new(@"\b(\d{6})\b", RegexOptions.Compiled);

    private readonly object _gate = new();
    private readonly List<CapturedEmail> _sent = [];

    /// <summary>Every message sent so far, oldest first.</summary>
    public IReadOnlyList<CapturedEmail> Sent
    {
        get { lock (_gate) return [.. _sent]; }
    }

    public Task<EmailSendResult> SendAsync(string to, string subject, string body,
        bool transactional = false, string? html = null)
    {
        lock (_gate) _sent.Add(new CapturedEmail(to, subject, body, transactional));
        // Mirrors a real provider: report accepted so callers take the happy path.
        return Task.FromResult(EmailSendResult.Accepted($"e2e-{_sent.Count}"));
    }

    /// <summary>Most recent 6-digit code emailed to <paramref name="email"/> (sign-in or confirm).</summary>
    public string LatestCode(string email, string subjectContains = "code") =>
        SixDigits.Match(LatestFor(email, subjectContains).Body) is { Success: true } m
            ? m.Groups[1].Value
            : throw new InvalidOperationException($"No 6-digit code in the latest '{subjectContains}' email to {email}.");

    /// <summary>Newest-first search for a URL containing <paramref name="pathContains"/> (e.g. "/reset").</summary>
    public string LatestLink(string email, string pathContains)
    {
        lock (_gate)
        {
            foreach (var msg in _sent.Where(m =>
                         m.To.Equals(email, StringComparison.OrdinalIgnoreCase)).Reverse())
                foreach (Match m in Url.Matches(msg.Body))
                    if (m.Value.Contains(pathContains, StringComparison.OrdinalIgnoreCase))
                        return m.Value;
        }
        throw new InvalidOperationException(
            $"No email to {email} contains a URL with '{pathContains}'.");
    }

    /// <summary>Latest message to <paramref name="email"/> whose subject contains <paramref name="subjectContains"/>.</summary>
    public CapturedEmail LatestFor(string email, string subjectContains)
    {
        lock (_gate)
            return _sent.LastOrDefault(m =>
                       m.To.Equals(email, StringComparison.OrdinalIgnoreCase)
                       && m.Subject.Contains(subjectContains, StringComparison.OrdinalIgnoreCase))
                   ?? throw new InvalidOperationException(
                       $"No email with subject containing '{subjectContains}' was sent to {email}.");
    }

    public void Clear()
    {
        lock (_gate) _sent.Clear();
    }
}
