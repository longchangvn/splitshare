using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using SplitShare.Api.Auth;

namespace SplitShare.Tests;

/// <summary>OneSignal email channel sender + Email:Provider factory.</summary>
public sealed class EmailSenderTests
{
    private sealed class CaptureHandler(Func<HttpResponseMessage> respond) : HttpMessageHandler
    {
        public readonly List<(string Url, string? Auth, string Body)> Requests = [];
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Requests.Add((request.RequestUri!.ToString(),
                request.Headers.TryGetValues("Authorization", out var a) ? a.Single() : null,
                await request.Content!.ReadAsStringAsync(ct)));
            return respond();
        }
    }

    private sealed class FakeHttp(HttpMessageHandler h) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(h);
    }

    private static IConfiguration Cfg(Dictionary<string, string?> values) =>
        new ConfigurationBuilder().AddInMemoryCollection(values).Build();

    private static readonly Dictionary<string, string?> Base = new()
    {
        ["Email:Provider"] = "onesignal",
        ["Notification:OneSignal:AppId"] = "app-1",
        ["Notification:OneSignal:ApiKey"] = "key-1"
    };

    private static OneSignalEmailSender Sender(CaptureHandler h, Dictionary<string, string?> cfg) =>
        new(new FakeHttp(h), Cfg(cfg), NullLogger<OneSignalEmailSender>.Instance);

    [Fact]
    public async Task Sends_Email_Channel_Payload()
    {
        var h = new CaptureHandler(() => Json(HttpStatusCode.OK, "{\"id\":\"msg-123\"}"));
        var cfg = new Dictionary<string, string?>(Base) { ["Email:FromName"] = "SplitShare" };
        var result = await Sender(h, cfg).SendAsync("a@x.com", "Reset", "Go: https://app.test/reset/abc?x=1&y=2\nbye <3", transactional: true);

        Assert.Equal(EmailSendResult.Accepted("msg-123"), result);
        Assert.True(result.Sent);
        var (url, auth, body) = Assert.Single(h.Requests);
        Assert.Equal("https://api.onesignal.com/notifications?c=email", url);
        Assert.Equal("Key key-1", auth);
        var j = JsonDocument.Parse(body).RootElement;
        Assert.Equal("app-1", j.GetProperty("app_id").GetString());
        Assert.Equal("email", j.GetProperty("target_channel").GetString());
        Assert.Equal("a@x.com", j.GetProperty("email_to")[0].GetString());
        Assert.Equal("Reset", j.GetProperty("email_subject").GetString());
        Assert.Equal("SplitShare", j.GetProperty("email_from_name").GetString());
        Assert.False(j.TryGetProperty("email_from_address", out _)); // blank → omitted (dashboard default)
        Assert.True(j.GetProperty("include_unsubscribed").GetBoolean());
        Assert.True(j.GetProperty("disable_email_click_tracking").GetBoolean());
        var html = j.GetProperty("email_body").GetString()!;
        Assert.Contains("<a href=\"https://app.test/reset/abc?x=1&amp;y=2\">", html);
        Assert.Contains("<br>bye &lt;3", html);
    }

    [Fact]
    public async Task Non_Transactional_Respects_Unsubscribe_And_Email_Keys_Override()
    {
        var h = new CaptureHandler(() => new HttpResponseMessage(HttpStatusCode.OK));
        var cfg = new Dictionary<string, string?>(Base)
        {
            ["Email:OneSignal:AppId"] = "app-2", ["Email:OneSignal:ApiKey"] = "key-2"
        };
        await Sender(h, cfg).SendAsync("a@x.com", "Invite", "Join");
        var (_, auth, body) = Assert.Single(h.Requests);
        Assert.Equal("Key key-2", auth);
        var j = JsonDocument.Parse(body).RootElement;
        Assert.Equal("app-2", j.GetProperty("app_id").GetString());
        Assert.False(j.TryGetProperty("include_unsubscribed", out _));
    }

    private static HttpResponseMessage Json(HttpStatusCode code, string body) =>
        new(code) { Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json") };

    [Fact]
    public async Task Failures_Are_Returned_Not_Thrown_And_Missing_Config_Skips()
    {
        var failing = new CaptureHandler(() => throw new HttpRequestException("down"));
        var down = await Sender(failing, Base).SendAsync("a@x.com", "s", "b"); // no throw
        Assert.Equal(EmailSendStatus.Failed, down.Status);
        Assert.Equal("Email provider unreachable.", down.Error);

        var error = new CaptureHandler(() => Json(HttpStatusCode.BadRequest, "{\"errors\":[\"Invalid email\"]}"));
        var rejected = await Sender(error, Base).SendAsync("a@x.com", "s", "b"); // no throw
        Assert.Equal(EmailSendStatus.Failed, rejected.Status);
        Assert.Equal("Email provider rejected the message (HTTP 400): Invalid email", rejected.Error);

        var unconfigured = new CaptureHandler(() => new HttpResponseMessage(HttpStatusCode.OK));
        var skipped = await Sender(unconfigured, new() { ["Email:Provider"] = "onesignal" }).SendAsync("a@x.com", "s", "b");
        Assert.Empty(unconfigured.Requests);
        Assert.Equal(EmailSendStatus.NotConfigured, skipped.Status);
        Assert.False(skipped.Sent);
    }

    [Theory]
    [InlineData("")] // empty 200
    [InlineData("{\"id\":\"\"}")]
    [InlineData("{\"id\":\"x\",\"errors\":{\"invalid_email_tokens\":[\"a@x.com\"]}}")]
    [InlineData("not json")]
    public async Task Ok_Without_Message_Id_Is_Not_Sent(string body)
    {
        var h = new CaptureHandler(() => Json(HttpStatusCode.OK, body));
        var r = await Sender(h, Base).SendAsync("a@x.com", "s", "b");
        Assert.Equal(EmailSendStatus.Failed, r.Status);
        Assert.StartsWith("Email provider did not send the message", r.Error);
    }

    [Fact]
    public async Task Not_Subscribed_Is_Explained()
    {
        var h = new CaptureHandler(() => Json(HttpStatusCode.OK,
            "{\"id\":\"\",\"errors\":[\"All included players are not subscribed\"]}"));
        var r = await Sender(h, Base).SendAsync("a@x.com", "s", "b");
        Assert.Equal(EmailSendStatus.Failed, r.Status);
        Assert.Equal("Email provider did not send the message: no deliverable email subscription for the recipient in OneSignal.", r.Error);
    }

    [Fact]
    public async Task Missing_Email_Channel_Is_Named()
    {
        // Verbatim OneSignal reply for an app without the Email channel.
        var h = new CaptureHandler(() => Json(HttpStatusCode.OK,
            "{\"id\":\"\",\"errors\":[\"All included players are not subscribed\"],\"warnings\":[\"You must configure Email notifications in your OneSignal settings if you wish to send messages to Email users.\"]}"));
        var r = await Sender(h, Base).SendAsync("a@x.com", "s", "b", transactional: true);
        Assert.Equal(EmailSendStatus.Failed, r.Status);
        Assert.Contains("no Email channel configured", r.Error);
    }

    [Fact]
    public async Task Stub_Never_Claims_Sent()
    {
        var r = await new StubEmailSender(NullLogger<StubEmailSender>.Instance).SendAsync("a@x.com", "s", "b");
        Assert.Equal(EmailSendStatus.NotConfigured, r.Status);
    }

    [Fact]
    public void Factory_Selects_By_Config()
    {
        var http = new FakeHttp(new CaptureHandler(() => new HttpResponseMessage(HttpStatusCode.OK)));
        Assert.IsType<StubEmailSender>(EmailSenderFactory.Create(Cfg(new() { ["Email:Provider"] = null })));
        Assert.IsType<StubEmailSender>(EmailSenderFactory.Create(Cfg(new() { ["Email:Provider"] = " " })));
        Assert.IsType<OneSignalEmailSender>(EmailSenderFactory.Create(Cfg(new() { ["Email:Provider"] = "OneSignal" }), http));
        Assert.IsType<TwilioSendGridEmailSender>(EmailSenderFactory.Create(Cfg(new() { ["Email:Provider"] = "Twilio" }), http));
        Assert.IsType<TwilioSendGridEmailSender>(EmailSenderFactory.Create(Cfg(new() { ["Email:Provider"] = "sendgrid" }), http));
        Assert.Throws<InvalidOperationException>(() => EmailSenderFactory.Create(Cfg(new() { ["Email:Provider"] = "onesignal" })));
        Assert.Throws<InvalidOperationException>(() => EmailSenderFactory.Create(Cfg(new() { ["Email:Provider"] = "twilio" })));
        Assert.Throws<InvalidOperationException>(() => EmailSenderFactory.Create(Cfg(new() { ["Email:Provider"] = "smtp" }), http));
    }

    [Fact]
    public void Twilio_Is_The_Primary_Provider_In_Appsettings()
    {
        var cfg = new ConfigurationBuilder()
            .AddJsonFile(Path.Combine(RepoRoot(), "api", "appsettings.json"))
            .Build();
        Assert.Equal("twilio", cfg["Email:Provider"]);
        Assert.Null(cfg["Email:Twilio:ApiKey"]); // secret: env/user-secrets only
    }

    private static string RepoRoot()
    {
        var d = new DirectoryInfo(AppContext.BaseDirectory);
        while (d is not null && !File.Exists(Path.Combine(d.FullName, "SplitShare.sln"))) d = d.Parent;
        return d?.FullName ?? throw new DirectoryNotFoundException("SplitShare.sln not found");
    }

    // --- Twilio SendGrid ---

    private static readonly Dictionary<string, string?> Twilio = new()
    {
        ["Email:Provider"] = "twilio",
        ["Email:Twilio:ApiKey"] = "SG.test-key",
        ["Email:FromAddress"] = "no-reply@splitshare.test",
        ["Email:FromName"] = "SplitShare"
    };

    private static TwilioSendGridEmailSender TwilioSender(CaptureHandler h, Dictionary<string, string?> cfg) =>
        new(new FakeHttp(h), Cfg(cfg), NullLogger<TwilioSendGridEmailSender>.Instance);

    private static HttpResponseMessage Accepted(string? id)
    {
        var r = new HttpResponseMessage(HttpStatusCode.Accepted);
        if (id is not null) r.Headers.Add("X-Message-Id", id);
        return r;
    }

    [Fact]
    public async Task Twilio_Sends_MailSend_Payload()
    {
        var h = new CaptureHandler(() => Accepted("sg-123"));
        var result = await TwilioSender(h, Twilio).SendAsync("a@x.com", "Reset", "Go: https://app.test/r/abc?x=1&y=2", transactional: true);

        Assert.Equal(EmailSendResult.Accepted("sg-123"), result);
        var (url, auth, body) = Assert.Single(h.Requests);
        Assert.Equal(TwilioSendGridEmailSender.DefaultEndpoint, url);
        Assert.Equal("Bearer SG.test-key", auth);
        var j = JsonDocument.Parse(body).RootElement;
        Assert.Equal("a@x.com", j.GetProperty("personalizations")[0].GetProperty("to")[0].GetProperty("email").GetString());
        Assert.Equal("no-reply@splitshare.test", j.GetProperty("from").GetProperty("email").GetString());
        Assert.Equal("SplitShare", j.GetProperty("from").GetProperty("name").GetString());
        Assert.Equal("Reset", j.GetProperty("subject").GetString());
        Assert.Equal("text/plain", j.GetProperty("content")[0].GetProperty("type").GetString());
        Assert.Contains("<a href=\"https://app.test/r/abc?x=1&amp;y=2\">",
            j.GetProperty("content")[1].GetProperty("value").GetString());
        Assert.True(j.GetProperty("mail_settings").GetProperty("bypass_unsubscribe_management").GetProperty("enable").GetBoolean());
        Assert.False(j.GetProperty("tracking_settings").GetProperty("click_tracking").GetProperty("enable").GetBoolean());
    }

    [Fact]
    public async Task Twilio_NonTransactional_Respects_Unsubscribe()
    {
        var h = new CaptureHandler(() => Accepted("sg-1"));
        await TwilioSender(h, Twilio).SendAsync("a@x.com", "Nudge", "Pay up");
        var j = JsonDocument.Parse(Assert.Single(h.Requests).Body).RootElement;
        Assert.False(j.TryGetProperty("mail_settings", out _));
    }

    [Fact]
    public async Task Twilio_Failures_Returned_Not_Thrown_And_Missing_Config_Skips()
    {
        var down = await TwilioSender(new CaptureHandler(() => throw new HttpRequestException("down")), Twilio)
            .SendAsync("a@x.com", "s", "b");
        Assert.Equal("Email provider unreachable.", down.Error);

        var rejected = await TwilioSender(new CaptureHandler(() => Json(HttpStatusCode.Forbidden,
                "{\"errors\":[{\"message\":\"The from address does not match a verified Sender Identity.\",\"field\":\"from\"}]}")), Twilio)
            .SendAsync("a@x.com", "s", "b");
        Assert.Equal(EmailSendStatus.Failed, rejected.Status);
        Assert.Equal("Email provider rejected the message (HTTP 403): The from address does not match a verified Sender Identity.", rejected.Error);

        var noId = await TwilioSender(new CaptureHandler(() => Accepted(null)), Twilio).SendAsync("a@x.com", "s", "b");
        Assert.Equal(EmailSendStatus.Failed, noId.Status);

        foreach (var missing in new[] { "Email:Twilio:ApiKey", "Email:FromAddress" })
        {
            var h = new CaptureHandler(() => Accepted("x"));
            var cfg = new Dictionary<string, string?>(Twilio) { [missing] = null };
            var skipped = await TwilioSender(h, cfg).SendAsync("a@x.com", "s", "b");
            Assert.Empty(h.Requests);
            Assert.Equal(EmailSendStatus.NotConfigured, skipped.Status);
        }
    }
}
