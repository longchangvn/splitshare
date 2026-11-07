using SplitShare.Api.Auth;

namespace SplitShare.Tests;

/// <summary>Branded password-reset and invite emails.</summary>
public sealed class EmailTemplatesTests
{
    private const string Hostile = "<script>alert(1)</script>\r\nBcc: x@evil.test";

    [Fact]
    public void PasswordReset_Has_Button_Fallback_Expiry_And_Preheader()
    {
        var m = EmailTemplates.PasswordReset("Alex", "https://app.test/reset/AB12?x=1&y=2", 15, "alex@x.io");

        Assert.Equal("Reset your SplitShare password", m.Subject);
        Assert.Contains("Reset password: https://app.test/reset/AB12?x=1&y=2", m.Text);
        Assert.Contains("15 minutes", m.Text);
        Assert.Contains("Ignore this email", m.Text);
        Assert.Equal(2, CountOf(m.Html, "href=\"https://app.test/reset/AB12?x=1&amp;y=2\"")); // button + fallback
        Assert.Contains(">Reset password</a>", m.Html);
        Assert.Contains("This link works for 15 minutes and can be used once.", m.Html);
        Assert.Contains("alex@x.io", m.Html);
        Assert.StartsWith("<!DOCTYPE html><html lang=\"en\">", m.Html);
    }

    [Fact]
    public void GroupInvite_Shows_Inviter_Group_Next_Step_And_Expiry()
    {
        var m = EmailTemplates.GroupInvite("Minh", "Da Lat Trip", null,
            "Open the link and choose a password to join the group.", "https://app.test/invite/7C1E", 30);

        Assert.Equal("Minh invited you to \"Da Lat Trip\" on SplitShare", m.Subject);
        Assert.StartsWith("Hi,\n", m.Text);
        Assert.Contains("Accept the invitation: https://app.test/invite/7C1E", m.Text);
        Assert.Contains("choose a password", m.Text);
        Assert.Contains("30 days", m.Text);
        Assert.Contains(">Accept invitation</a>", m.Html);
        Assert.Contains("Da Lat Trip", m.Html);
        Assert.Contains("Sent on behalf of Minh via SplitShare.", m.Html);

        var known = EmailTemplates.GroupInvite("Minh", "Trip", "Lan", "Open the link and log in to join the group.", "https://t/i/1", 30);
        Assert.StartsWith("Hi Lan,\n", known.Text);
    }

    [Fact]
    public void User_Values_Are_Encoded_Clipped_And_Single_Line()
    {
        var m = EmailTemplates.GroupInvite(Hostile, Hostile, Hostile, "Next.", "https://t/i/1", 30);

        Assert.DoesNotContain("<script>", m.Html);
        Assert.Contains("&lt;script&gt;", m.Html);
        Assert.DoesNotContain('\n', m.Subject);
        Assert.DoesNotContain('\r', m.Subject);
        Assert.True(m.Subject.Length <= 2 * EmailTemplates.MaxNameLength + 40);

        var r = EmailTemplates.PasswordReset(Hostile, "https://t/r/1", 15, "a\"<b>@x.io");
        Assert.DoesNotContain("<script>", r.Html);
        Assert.DoesNotContain("a\"<b>", r.Html);
    }

    [Theory]
    [InlineData("  Ann  ", "Ann")]
    [InlineData("a\r\n\tb", "a b")]
    [InlineData(null, "")]
    public void Clip_Normalizes(string? input, string expected) => Assert.Equal(expected, EmailTemplates.Clip(input));

    [Fact]
    public void Clip_Caps_Length_With_Ellipsis()
    {
        var c = EmailTemplates.Clip(new string('x', 100));
        Assert.Equal(EmailTemplates.MaxNameLength, c.Length);
        Assert.EndsWith("…", c);
    }

    private static int CountOf(string s, string sub)
    {
        int n = 0, i = 0;
        while ((i = s.IndexOf(sub, i, StringComparison.Ordinal)) >= 0) { n++; i += sub.Length; }
        return n;
    }
}
