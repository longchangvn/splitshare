using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using SplitShare.Api.Auth;

namespace SplitShare.Tests;

public sealed class TmpEmailLive
{
    private sealed class Http : IHttpClientFactory { public HttpClient CreateClient(string n) => new(); }

    private sealed class Capture : ILogger<OneSignalEmailSender>
    {
        public readonly List<string> Lines = [];
        public IDisposable? BeginScope<T>(T s) where T : notnull => null;
        public bool IsEnabled(LogLevel l) => true;
        public void Log<T>(LogLevel l, EventId e, T s, Exception? ex, Func<T, Exception?, string> f)
            => Lines.Add($"{l}: {f(s, ex)} {ex?.Message}");
    }

    [Fact]
    public async Task Send_Real_Email()
    {
        var to = Environment.GetEnvironmentVariable("LIVE_EMAIL_TO");
        if (string.IsNullOrEmpty(to)) return;
        var cfg = new ConfigurationBuilder()
            .AddJsonFile(Path.GetFullPath("../../../../api/appsettings.json"))
            .AddEnvironmentVariables().Build();
        var log = new Capture();
        await new OneSignalEmailSender(new Http(), cfg, log).SendAsync(to, "SplitShare email test",
            "This is a test of SplitShare email via OneSignal.\nReset link example: https://example.com/reset/test-token",
            transactional: true);
        Assert.True(log.Lines.Any(l => l.Contains("accepted")), string.Join(" | ", log.Lines));
    }
}
