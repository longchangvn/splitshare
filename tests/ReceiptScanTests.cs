using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using SplitShare.Api.Data;
using SplitShare.Api.Endpoints;
using SplitShare.Api.Expenses;
using SplitShare.Api.Models;

namespace SplitShare.Tests;

public sealed class ReceiptScanTests
{
    private static readonly byte[] Jpeg = [0xFF, 0xD8, 0xFF, 0xDB, 0x00, 0x02, 0xFF, 0xD9];

    // ---- ReceiptParser ----

    [Fact]
    public void Parser_Reads_Fenced_Json_And_Rounds_Total()
    {
        var s = ReceiptParser.Parse("""
            Here you go:
            ```json
            {"is_receipt":true,"total":21.004,"confidence":"HIGH"}
            ```
            """);
        Assert.Equal(21.00m, s.Total);
        Assert.Equal("high", s.Confidence);
        Assert.Empty(s.Warnings);
    }

    [Theory]
    [InlineData("""{"total":"1,234.50"}""", "1234.50")]
    [InlineData("""{"total":7}""", "7")]
    [InlineData("""{"total":0.015}""", "0.02")]
    public void Parser_Accepts_Numbers_And_Numeric_Strings(string json, string expected)
        => Assert.Equal(decimal.Parse(expected, System.Globalization.CultureInfo.InvariantCulture), ReceiptParser.Parse(json).Total);

    [Theory]
    [InlineData("""{"total":-5}""", "total_invalid")]
    [InlineData("""{"total":0}""", "total_invalid")]
    [InlineData("""{"total":2000000}""", "total_invalid")]
    [InlineData("""{"total":null}""", "total_missing")]
    [InlineData("""{"total":"about 20"}""", "total_missing")]
    [InlineData("""{"is_receipt":false,"total":10}""", "not_a_receipt")]
    public void Parser_Rejects_Bad_Totals(string json, string warning)
    {
        var s = ReceiptParser.Parse(json);
        Assert.Null(s.Total);
        Assert.Equal([warning], s.Warnings);
    }

    [Fact]
    public void Parser_Ignores_Unknown_Confidence()
        => Assert.Null(ReceiptParser.Parse("""{"total":3,"confidence":"maybe"}""").Confidence);

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("I cannot read this image.")]
    [InlineData("{not json}")]
    public void Parser_Throws_Provider_Error_On_Garbage(string? text)
        => Assert.Throws<OcrProviderException>(() => ReceiptParser.Parse(text));

    // ---- OpenAiCompatibleOcrService ----

    private sealed class FakeHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        public HttpRequestMessage? Last;
        public string? LastBody;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Last = request;
            LastBody = request.Content is null ? null : await request.Content.ReadAsStringAsync(ct);
            return respond(request);
        }
    }

    private sealed class FakeFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private static IConfiguration OcrConfig(bool enabled = true, string? key = "test-key") =>
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Ocr:Enabled"] = enabled.ToString(),
            ["Ocr:BaseUrl"] = "https://opencode.test/inference/openai/v1/",
            ["Ocr:Model"] = "gemini-3.5-flash-lite",
            ["Ocr:ApiKey"] = key,
        }).Build();

    private static HttpResponseMessage Chat(string content, HttpStatusCode status = HttpStatusCode.OK) => new(status)
    {
        Content = new StringContent(JsonSerializer.Serialize(new
        {
            choices = new[] { new { message = new { role = "assistant", content } } }
        }), Encoding.UTF8, "application/json")
    };

    private static OpenAiCompatibleOcrService Provider(FakeHandler h, IConfiguration? cfg = null)
        => new(new FakeFactory(h), cfg ?? OcrConfig(), NullLogger<OpenAiCompatibleOcrService>.Instance);

    [Fact]
    public async Task Provider_Sends_OpenAi_Request_And_Parses_Total()
    {
        var h = new FakeHandler(_ => Chat("""{"is_receipt":true,"total":4.5,"confidence":"high"}"""));
        var s = await Provider(h).ExtractAsync(Jpeg, "image/jpeg");

        Assert.Equal(4.50m, s.Total);
        Assert.Equal("https://opencode.test/inference/openai/v1/chat/completions", h.Last!.RequestUri!.ToString());
        Assert.Equal("Bearer", h.Last.Headers.Authorization!.Scheme);
        Assert.Equal("test-key", h.Last.Headers.Authorization.Parameter);
        using var body = JsonDocument.Parse(h.LastBody!);
        Assert.Equal("gemini-3.5-flash-lite", body.RootElement.GetProperty("model").GetString());
        var messages = body.RootElement.GetProperty("messages");
        Assert.Contains("final total", messages[0].GetProperty("content").GetString());
        var url = messages[1].GetProperty("content")[1].GetProperty("image_url").GetProperty("url").GetString();
        Assert.Equal($"data:image/jpeg;base64,{Convert.ToBase64String(Jpeg)}", url);
    }

    [Fact]
    public async Task Provider_Reads_Array_Content_Parts()
    {
        var h = new FakeHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("""{"choices":[{"message":{"content":[{"type":"text","text":"{\"total\":7}"}]}}]}""")
        });
        Assert.Equal(7m, (await Provider(h).ExtractAsync(Jpeg, "image/jpeg")).Total);
    }

    [Theory]
    [InlineData(HttpStatusCode.Forbidden)] // OpenCode FreeTierError
    [InlineData(HttpStatusCode.TooManyRequests)]
    [InlineData(HttpStatusCode.InternalServerError)]
    public async Task Provider_Maps_Http_Errors(HttpStatusCode status)
    {
        var h = new FakeHandler(_ => Chat("{}", status));
        await Assert.ThrowsAsync<OcrProviderException>(() => Provider(h).ExtractAsync(Jpeg, "image/jpeg"));
    }

    [Fact]
    public async Task Provider_Maps_Timeout_And_Network_Errors()
    {
        var timeout = new FakeHandler(_ => throw new TaskCanceledException("timeout"));
        await Assert.ThrowsAsync<OcrProviderException>(() => Provider(timeout).ExtractAsync(Jpeg, "image/jpeg"));
        var down = new FakeHandler(_ => throw new HttpRequestException("dns"));
        await Assert.ThrowsAsync<OcrProviderException>(() => Provider(down).ExtractAsync(Jpeg, "image/jpeg"));
    }

    [Fact]
    public void Provider_Disabled_Without_Flag_Or_Key()
    {
        var h = new FakeHandler(_ => Chat("{}"));
        Assert.True(Provider(h).Enabled);
        Assert.False(Provider(h, OcrConfig(enabled: false)).Enabled);
        Assert.False(Provider(h, OcrConfig(key: null)).Enabled);
        Assert.False(new DisabledOcrService().Enabled);
    }

    // ---- ReceiptScanService ----

    private sealed class FakeOcr(bool enabled = true, Exception? fail = null) : IOcrService
    {
        public bool Enabled => enabled;
        public byte[]? Image;
        public Task<ReceiptSuggestion> ExtractAsync(byte[] image, string mime, CancellationToken ct = default)
        {
            if (fail is not null) throw fail;
            Image = image;
            return Task.FromResult(new ReceiptSuggestion(9.99m, "high", []));
        }
    }

    private static async Task<(AppDbContext Db, Guid GroupId, Guid MemberId)> SeedAsync()
    {
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var member = Guid.NewGuid();
        var g = new Group { Name = "Trip", CreatedBy = member };
        db.Groups.Add(g);
        db.GroupMembers.Add(new GroupMember { GroupId = g.Id, UserId = member, Role = "owner" });
        await db.SaveChangesAsync();
        return (db, g.Id, member);
    }

    private static ReceiptScanService Scanner(AppDbContext db, IOcrService ocr)
        => new(db, ocr, NullLogger<ReceiptScanService>.Instance);

    [Fact]
    public async Task Scan_Returns_Total()
    {
        var (db, gid, me) = await SeedAsync();
        var r = await Scanner(db, new FakeOcr()).ScanAsync(me, gid, "r.jpg", "image/jpeg", Jpeg);

        Assert.True(r.Ok);
        Assert.Equal("""{"total":9.99,"confidence":"high","warnings":[]}""",
            JsonSerializer.Serialize(ReceiptScanEndpoints.ToDto((ReceiptSuggestion)r.Data!)));
    }

    [Fact]
    public async Task Scan_Guards_Membership_Group_And_Capability()
    {
        var (db, gid, me) = await SeedAsync();
        Assert.Equal("FORBIDDEN", (await Scanner(db, new FakeOcr()).ScanAsync(Guid.NewGuid(), gid, "r.jpg", "image/jpeg", Jpeg)).ErrorCode);
        Assert.Equal("NOT_FOUND", (await Scanner(db, new FakeOcr()).ScanAsync(me, Guid.NewGuid(), "r.jpg", "image/jpeg", Jpeg)).ErrorCode);
        Assert.Equal("OCR_UNAVAILABLE", (await Scanner(db, new FakeOcr(enabled: false)).ScanAsync(me, gid, "r.jpg", "image/jpeg", Jpeg)).ErrorCode);
    }

    [Fact]
    public async Task Scan_Validates_File()
    {
        var (db, gid, me) = await SeedAsync();
        var svc = Scanner(db, new FakeOcr());
        Assert.Equal("VALIDATION", (await svc.ScanAsync(me, gid, "r.heic", "image/heic", Jpeg)).ErrorCode);
        Assert.Equal("VALIDATION", (await svc.ScanAsync(me, gid, "r.pdf", "application/pdf", Jpeg)).ErrorCode);
        Assert.Equal("VALIDATION", (await svc.ScanAsync(me, gid, "r.jpg", "image/jpeg", [])).ErrorCode);
        Assert.Equal("VALIDATION", (await svc.ScanAsync(me, gid, "r.jpg", "image/jpeg",
            new byte[ExpenseService.MaxImageBytes + 1])).ErrorCode);
        Assert.True((await svc.ScanAsync(me, gid, "r.jpg", "", Jpeg)).Ok); // mime inferred from name
    }

    [Fact]
    public async Task Scan_Strips_Metadata_Before_Provider()
    {
        var (db, gid, me) = await SeedAsync();
        var ocr = new FakeOcr();
        // SOI + APP1 ("Exif") + SOS + scan data + EOI
        byte[] withExif = [0xFF, 0xD8, 0xFF, 0xE1, 0x00, 0x06, 0x45, 0x78, 0x69, 0x66,
            0xFF, 0xDA, 0x00, 0x02, 0x11, 0x22, 0xFF, 0xD9];
        await Scanner(db, ocr).ScanAsync(me, gid, "r.jpg", "image/jpeg", withExif);
        Assert.Equal([0xFF, 0xD8, 0xFF, 0xDA, 0x00, 0x02, 0x11, 0x22, 0xFF, 0xD9], ocr.Image);
    }

    [Fact]
    public async Task Scan_Maps_Provider_Failure()
    {
        var (db, gid, me) = await SeedAsync();
        var r = await Scanner(db, new FakeOcr(fail: new OcrProviderException("boom")))
            .ScanAsync(me, gid, "r.jpg", "image/jpeg", Jpeg);
        Assert.Equal("OCR_PROVIDER_ERROR", r.ErrorCode);
        Assert.DoesNotContain("boom", r.Error);
    }
}

/// <summary>
/// Real call to the configured provider with tests/fixtures/receipt-sample.jpg (TOTAL USD 21.00).
/// Opt-in only (costs provider credits):
///   set -a; . ./.env; set +a; OCR_LIVE_TEST=1 dotnet test tests --filter ReceiptScanLiveTests
/// Reads Ocr__ApiKey, optional Ocr__BaseUrl / Ocr__Model from the environment.
/// </summary>
public sealed class ReceiptScanLiveTests
{
    private sealed class RealFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new() { Timeout = TimeSpan.FromSeconds(90) };
    }

    [Fact]
    public async Task Live_Provider_Reads_Sample_Receipt_Total()
    {
        var env = new ConfigurationBuilder().AddEnvironmentVariables().Build();
        Assert.SkipUnless(env["OCR_LIVE_TEST"] == "1" && !string.IsNullOrWhiteSpace(env["Ocr:ApiKey"]),
            "Set OCR_LIVE_TEST=1 and Ocr__ApiKey to call the real provider.");
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Ocr:Enabled"] = "true",
            ["Ocr:BaseUrl"] = env["Ocr:BaseUrl"] ?? "https://opencode.ai/inference/openai/v1",
            ["Ocr:Model"] = env["Ocr:Model"] ?? "glm-5.3-flash-free",
            ["Ocr:ApiKey"] = env["Ocr:ApiKey"],
        }).Build();
        var image = await File.ReadAllBytesAsync(Path.Combine(AppContext.BaseDirectory, "fixtures", "receipt-sample.jpg"),
            TestContext.Current.CancellationToken);

        var s = await new OpenAiCompatibleOcrService(new RealFactory(), config,
            NullLogger<OpenAiCompatibleOcrService>.Instance).ExtractAsync(image, "image/jpeg", TestContext.Current.CancellationToken);

        Assert.Equal(21.00m, s.Total);
    }
}
