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
        var h = new CaptureHandler(() => new HttpResponseMessage(HttpStatusCode.OK));
        var cfg = new Dictionary<string, string?>(Base) { ["Email:FromName"] = "SplitShare" };
        await Sender(h, cfg).SendAsync("a@x.com", "Reset", "Go: https://app.test/reset/abc?x=1&y=2\nbye <3", transactional: true);

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

    [Fact]
    public async Task Failures_Are_Suppressed_And_Missing_Config_Skips()
    {
        var failing = new CaptureHandler(() => throw new HttpRequestException("down"));
        await Sender(failing, Base).SendAsync("a@x.com", "s", "b"); // no throw

        var error = new CaptureHandler(() => new HttpResponseMessage(HttpStatusCode.BadRequest));
        await Sender(error, Base).SendAsync("a@x.com", "s", "b"); // no throw

        var unconfigured = new CaptureHandler(() => new HttpResponseMessage(HttpStatusCode.OK));
        await Sender(unconfigured, new() { ["Email:Provider"] = "onesignal" }).SendAsync("a@x.com", "s", "b");
        Assert.Empty(unconfigured.Requests);
    }

    [Fact]
    public void Factory_Selects_By_Config()
    {
        var http = new FakeHttp(new CaptureHandler(() => new HttpResponseMessage(HttpStatusCode.OK)));
        Assert.IsType<StubEmailSender>(EmailSenderFactory.Create(Cfg(new() { ["Email:Provider"] = null })));
        Assert.IsType<StubEmailSender>(EmailSenderFactory.Create(Cfg(new() { ["Email:Provider"] = " " })));
        Assert.IsType<OneSignalEmailSender>(EmailSenderFactory.Create(Cfg(new() { ["Email:Provider"] = "OneSignal" }), http));
        Assert.Throws<InvalidOperationException>(() => EmailSenderFactory.Create(Cfg(new() { ["Email:Provider"] = "onesignal" })));
        Assert.Throws<InvalidOperationException>(() => EmailSenderFactory.Create(Cfg(new() { ["Email:Provider"] = "smtp" }), http));
    }
}
