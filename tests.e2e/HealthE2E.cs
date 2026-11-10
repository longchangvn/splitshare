using System.Net;

namespace SplitShare.E2E;

/// <summary>Smoke: the stack is up, the DB is reachable and migrations ran.</summary>
public sealed class HealthE2E(E2eApiFactory api) : E2eTest(api)
{
    [Fact]
    public async Task Health_Endpoints_Answer_Without_Auth()
    {
        foreach (var url in new[] { "/health", "/db-ping", "/api/v1/health" })
        {
            var resp = await Api.CreateClient().GetAsync(url);
            Assert.True(resp.StatusCode == HttpStatusCode.OK,
                $"{url} expected 200 but got {(int)resp.StatusCode}: {await resp.Content.ReadAsStringAsync()}");
        }
    }

    [Fact]
    public async Task Capabilities_Report_Fake_Ocr_Enabled()
    {
        var caps = await AnonymousGetAsync("/api/v1/capabilities");
        Assert.True(caps.GetProperty("ocr_enabled").GetBoolean(),
            "the E2E host replaces IOcrService with FakeOcrService (Enabled = true)");
        Assert.True(caps.GetProperty("features").GetProperty("activity_feed").GetBoolean());
        Assert.True(caps.GetProperty("features").GetProperty("push_devices").GetBoolean());
    }

    [Fact]
    public async Task Migrations_Ran_So_Me_Requires_A_Token()
    {
        // 401 = the auth pipeline is live; 500/404 would mean the host half-booted.
        var resp = await Api.CreateClient().GetAsync("/api/v1/me");
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }
}
