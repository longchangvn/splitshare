using System.Net;
using System.Text.RegularExpressions;

namespace SplitShare.Api.Auth;

/// <summary>A rendered email: plain-text and HTML alternatives of the same message.</summary>
public sealed record EmailContent(string Subject, string Text, string Html);

/// <summary>
/// Branded account emails (password reset, sign-in code, email verification, group invite). Table layout with inline
/// styles for Outlook/Gmail; every user-controlled value is clipped and HTML-encoded.
/// </summary>
public static partial class EmailTemplates
{
    public const int MaxNameLength = 40;

    private const string Font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
    private const string Accent = "#0f766e", Ink = "#14201c", Muted = "#5f6f68", Line = "#d7e4de", Soft = "#eef6f2", Page = "#f3f4f3";

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();

    /// <summary>Single line, trimmed, at most <paramref name="max"/> chars (ellipsis when cut).</summary>
    public static string Clip(string? value, int max = MaxNameLength)
    {
        var s = Whitespace().Replace(value ?? "", " ").Trim();
        return s.Length <= max ? s : s[..(max - 1)].TrimEnd() + "…";
    }

    private static string H(string s) => WebUtility.HtmlEncode(s);

    public static EmailContent PasswordReset(string displayName, string link, int validMinutes, string recipient)
    {
        var name = Clip(displayName);
        var text =
            $"Hi {name},\n\n" +
            "We got a request to reset your SplitShare password.\n\n" +
            $"Reset password: {link}\n\n" +
            $"This link expires in {validMinutes} minutes and works only once.\n\n" +
            "Didn't ask for this? Ignore this email. Your password stays the same.\n\n" +
            "— SplitShare";
        var body =
            Paragraph($"Hi {H(name)},") +
            Paragraph("We got a request to reset the password for your SplitShare account.") +
            Button("Reset password", link) +
            Paragraph($"This link expires in <strong>{validMinutes} minutes</strong> and works only once.") +
            Fallback(link) +
            Note("Didn't ask for this? Ignore this email. Your password stays the same.");
        var html = Layout(
            preheader: $"This link works for {validMinutes} minutes and can be used once.",
            heading: "Reset your password",
            body: body,
            footer: $"You received this because a password reset was requested for {H(recipient)}.");
        return new("Reset your SplitShare password", text, html);
    }

    /// <param name="displayName">Account name when the address already has an account, else null.</param>
    public static EmailContent LoginCode(string? displayName, string code, int validMinutes, string recipient) =>
        CodeEmail(displayName, code, validMinutes, recipient,
            heading: "Your sign-in code",
            textLead: "Your SplitShare sign-in code is",
            htmlLead: "Enter this code to continue to SplitShare:",
            ignore: "Didn't try to sign in? Ignore this email. Nobody can sign in without this code.",
            why: "a sign-in code was requested",
            subject: $"{code} is your SplitShare code");

    /// <summary>Code sent from Profile → Verify email.</summary>
    public static EmailContent VerifyCode(string? displayName, string code, int validMinutes, string recipient) =>
        CodeEmail(displayName, code, validMinutes, recipient,
            heading: "Confirm your email",
            textLead: "Your SplitShare email confirmation code is",
            htmlLead: "Enter this code in SplitShare to confirm your email address:",
            ignore: "Didn't ask for this? Ignore this email. Your account stays the same.",
            why: "an email confirmation code was requested",
            subject: $"{code} is your SplitShare confirmation code");

    private static EmailContent CodeEmail(string? displayName, string code, int validMinutes, string recipient,
        string heading, string textLead, string htmlLead, string ignore, string why, string subject)
    {
        var greeting = string.IsNullOrWhiteSpace(displayName) ? "Hi," : $"Hi {Clip(displayName)},";
        var text =
            $"{greeting}\n\n" +
            $"{textLead}: {code}\n\n" +
            $"It expires in {validMinutes} minutes and works only once.\n\n" +
            $"{ignore}\n\n" +
            "— SplitShare";
        var body =
            Paragraph(H(greeting)) +
            Paragraph(H(htmlLead)) +
            "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"margin:8px 0 24px\"><tr>" +
            $"<td style=\"background:{Soft};border:1px solid {Line};border-radius:8px;padding:14px 24px;font-family:{Font};font-size:30px;font-weight:700;letter-spacing:8px;color:{Ink}\">{H(code)}</td>" +
            "</tr></table>" +
            Paragraph($"This code expires in <strong>{validMinutes} minutes</strong> and works only once.") +
            Note(H(ignore));
        var html = Layout(
            preheader: $"Your code is {code}. It expires in {validMinutes} minutes.",
            heading: heading,
            body: body,
            footer: $"You received this because {why} for {H(recipient)}.");
        return new(subject, text, html);
    }

    public static EmailContent VerifyEmail(string displayName, string link, string recipient)
    {
        var name = Clip(displayName);
        var text =
            $"Hi {name},\n\n" +
            $"Confirm your email address for SplitShare:\n{link}\n\n" +
            "If you didn't create a SplitShare account, you can ignore this email.\n\n" +
            "— SplitShare";
        var body =
            Paragraph($"Hi {H(name)},") +
            Paragraph("Confirm your email address to finish setting up your SplitShare account.") +
            Button("Confirm email", link) +
            Fallback(link) +
            Note("If you didn't create a SplitShare account, you can ignore this email.");
        var html = Layout(
            preheader: "Confirm your email address for SplitShare.",
            heading: "Confirm your email",
            body: body,
            footer: $"You received this because a SplitShare account was created for {H(recipient)}.");
        return new("Verify your SplitShare email", text, html);
    }

    /// <param name="inviteeName">Display name when the address already has an account, else null.</param>
    /// <param name="how">Variant-specific next step (log in / Google / choose a password).</param>
    public static EmailContent GroupInvite(string inviter, string groupName, string? inviteeName,
        string how, string link, int validDays)
    {
        var from = Clip(inviter);
        var group = Clip(groupName);
        var greeting = string.IsNullOrWhiteSpace(inviteeName) ? "Hi," : $"Hi {Clip(inviteeName)},";
        var text =
            $"{greeting}\n\n" +
            $"{from} invited you to split expenses in \"{group}\" on SplitShare.\n\n" +
            $"Accept the invitation: {link}\n\n" +
            $"{how} You're not added until you accept. The link works for {validDays} days.\n\n" +
            $"Don't know {from}? Ignore this email and you won't be added.\n\n" +
            "— SplitShare";
        var body =
            Paragraph(H(greeting)) +
            Paragraph($"<strong>{H(from)}</strong> invited you to split expenses in:") +
            $"<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"margin:0 0 8px\"><tr>" +
            $"<td style=\"background:{Soft};border:1px solid {Line};border-radius:8px;padding:14px 16px;font-family:{Font};font-size:18px;font-weight:600;color:{Ink}\">{H(group)}</td>" +
            "</tr></table>" +
            Button("Accept invitation", link) +
            Paragraph($"{H(how)} You're not added until you accept. The link works for {validDays} days.") +
            Fallback(link) +
            Note($"Don't know {H(from)}? Ignore this email and you won't be added.");
        var html = Layout(
            preheader: $"Accept to start splitting expenses together. The link works for {validDays} days.",
            heading: "You're invited to a group",
            body: body,
            footer: $"Sent on behalf of {H(from)} via SplitShare.");
        return new($"{from} invited you to \"{group}\" on SplitShare", text, html);
    }

    private static string Paragraph(string html) =>
        $"<p style=\"margin:0 0 16px;font-family:{Font};font-size:16px;line-height:1.5;color:{Ink}\">{html}</p>";

    private static string Button(string label, string link) =>
        "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"margin:8px 0 24px\"><tr>" +
        $"<td align=\"center\" bgcolor=\"{Accent}\" style=\"border-radius:8px\">" +
        $"<a href=\"{H(link)}\" target=\"_blank\" style=\"display:inline-block;padding:12px 28px;font-family:{Font};font-size:16px;font-weight:600;line-height:1.25;color:#ffffff;text-decoration:none;border-radius:8px\">{H(label)}</a>" +
        "</td></tr></table>";

    private static string Fallback(string link) =>
        $"<p style=\"margin:0 0 16px;font-family:{Font};font-size:13px;line-height:1.5;color:{Muted}\">" +
        "Button not working? Paste this link into your browser:<br>" +
        $"<a href=\"{H(link)}\" target=\"_blank\" style=\"color:{Accent};word-break:break-all\">{H(link)}</a></p>";

    private static string Note(string html) =>
        $"<p style=\"margin:24px 0 0;padding-top:16px;border-top:1px solid {Line};font-family:{Font};font-size:14px;line-height:1.5;color:{Muted}\">{html}</p>";

    private static string Layout(string preheader, string heading, string body, string footer) =>
        "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\">" +
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
        "<meta name=\"color-scheme\" content=\"light\"><meta name=\"supported-color-schemes\" content=\"light\">" +
        $"<title>{H(heading)}</title></head>" +
        $"<body style=\"margin:0;padding:0;background:{Page}\">" +
        $"<div style=\"display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:{Page};opacity:0\">{H(preheader)}</div>" +
        $"<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"background:{Page}\"><tr><td align=\"center\" style=\"padding:24px 12px\">" +
        "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"max-width:600px\">" +
        $"<tr><td style=\"background:{Accent};border-radius:12px 12px 0 0;padding:18px 32px;font-family:{Font};font-size:20px;font-weight:700;color:#ffffff\">SplitShare</td></tr>" +
        $"<tr><td style=\"background:#ffffff;border:1px solid {Line};border-top:0;border-radius:0 0 12px 12px;padding:32px\">" +
        $"<h1 style=\"margin:0 0 20px;font-family:{Font};font-size:22px;line-height:1.3;color:{Ink}\">{H(heading)}</h1>" +
        body +
        "</td></tr>" +
        $"<tr><td style=\"padding:20px 32px;font-family:{Font};font-size:12px;line-height:1.5;color:{Muted};text-align:center\">" +
        $"{footer}<br>SplitShare · Split expenses with friends</td></tr>" +
        "</table></td></tr></table></body></html>";
}
