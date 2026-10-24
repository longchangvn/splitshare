using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using SplitShare.Api.Common;
using SplitShare.Api.Data;
using SplitShare.Api.Endpoints;
using SplitShare.Api.Expenses;
using SplitShare.Api.Groups;
using SplitShare.Api.Models;

namespace SplitShare.Tests;

public sealed class ReceiptScanTests
{
    private static readonly byte[] Jpeg = [0xFF, 0xD8, 0xFF, 0xDB, 0x00, 0x02, 0xFF, 0xD9];
    private static readonly OcrContext UsdFood = new("USD", ["food", "stay", "transport", "other"]);

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
        Assert.Equal("high", s.Confidence.Total);
        Assert.Empty(s.Warnings);
    }

    [Theory]
    [InlineData("""{"total":"1,234.50"}""", "1234.50")]
    [InlineData("""{"total":7}""", "7")]
    [InlineData("""{"total":0.015}""", "0.02")]
    public void Parser_Accepts_Numbers_And_Numeric_Strings(string json, string expected)
        => Assert.Equal(decimal.Parse(expected, System.Globalization.CultureInfo.InvariantCulture),
            ReceiptParser.Parse(json).Total);

    [Theory]
    [InlineData("""{"total":-5}""", "total_invalid")]
    [InlineData("""{"total":0}""", "total_invalid")]
    [InlineData("""{"total":2000000}""", "total_invalid")]
    [InlineData("""{"total":null}""", "total_missing")]
    [InlineData("""{"total":"about 20"}""", "total_missing")]
    public void Parser_Rejects_Bad_Totals(string json, string warning)
    {
        var s = ReceiptParser.Parse(json);
        Assert.Null(s.Total);
        Assert.Equal([warning], s.Warnings);
    }

    [Fact]
    public void Parser_Returns_Empty_Card_For_A_Non_Receipt_With_No_Total()
    {
        var s = ReceiptParser.Parse("""{"is_receipt":false}""");
        Assert.Null(s.Total);
        Assert.Equal(["not_a_receipt"], s.Warnings);
        Assert.Null(s.Merchant);
    }

    [Fact]
    public void Parser_Keeps_Fields_When_A_Receipt_Is_Misclassified()
    {
        // Small local models sometimes answer is_receipt=false for a valid receipt;
        // keep the readable fields and let the user decide, with the warning attached.
        var s = ReceiptParser.Parse("""{"is_receipt":false,"merchant":"Hotel","total":142}""");
        Assert.Equal(142m, s.Total);
        Assert.Equal("Hotel", s.Merchant);
        Assert.Contains("not_a_receipt", s.Warnings);
    }

    [Fact]
    public void Parser_Reads_Rich_Fields_And_Per_Field_Confidence()
    {
        var s = ReceiptParser.Parse("""
            {"is_receipt":true,"merchant":"  Pho   24  ","total":19.98,"currency":"usd",
             "date":"2026-10-20","tax":1.48,"tip":1.00,"category":"FOOD",
             "confidence":{"total":"high","date":"low","merchant":"high","category":"maybe"}}
            """, UsdFood);

        Assert.Equal("Pho 24", s.Merchant);
        Assert.Equal(19.98m, s.Total);
        Assert.Equal("USD", s.Currency);
        Assert.Equal(new DateOnly(2026, 10, 20), s.Date);
        Assert.Equal(1.48m, s.Tax);
        Assert.Equal(1.00m, s.Tip);
        Assert.Equal("food", s.Category);
        Assert.Equal("high", s.Confidence.Total);
        Assert.Equal("low", s.Confidence.Date);
        Assert.Equal("high", s.Confidence.Merchant);
        Assert.Null(s.Confidence.Category); // invalid confidence values are ignored
        Assert.Empty(s.Warnings);
    }

    [Fact]
    public void Parser_Reads_Several_Receipts_From_One_Photo()
    {
        var list = ReceiptParser.ParseMany("""
            {"is_receipt":true,"receipts":[
              {"summary":"India Bazaar — 14 Oct 2026","merchant":"India Bazaar","amount_spent":43.25,
               "currency":"USD","date":"2026-10-14","category":"food","confidence":{"total":"high"}},
              {"summary":"Harbour Market BP — 15 Oct 2026","merchant":"Harbour Market BP","amount_spent":21.55,
               "currency":"USD","date":"2026-10-15","category":"food","confidence":{"total":"low"}}
            ]}
            """, UsdFood);

        Assert.Equal(2, list.Count);
        Assert.Equal("India Bazaar — 14 Oct 2026", list[0].Summary);
        Assert.Equal(43.25m, list[0].Total);
        Assert.Equal("high", list[0].Confidence.Total);
        Assert.Equal("Harbour Market BP", list[1].Merchant);
        Assert.Equal(21.55m, list[1].Total);
        Assert.Equal("low", list[1].Confidence.Total);
    }

    [Fact]
    public void Parser_Accepts_A_Total_Alias_And_Builds_A_Missing_Summary()
    {
        var s = ReceiptParser.Parse("""{"merchant":"Cafe","total":12.5,"date":"2026-10-20"}""");
        Assert.Equal(12.50m, s.Total);
        Assert.Equal("Cafe — 2026-10-20", s.Summary);
    }

    [Fact]
    public void Parser_Keeps_A_Model_Summary_And_Trims_It()
    {
        var s = ReceiptParser.Parse("""{"total":4,"summary":"  Corner   Cafe  "}""");
        Assert.Equal("Corner Cafe", s.Summary);
    }

    [Fact]
    public void Parser_Treats_An_Empty_Receipt_List_As_No_Receipt()
    {
        var list = ReceiptParser.ParseMany("""{"is_receipt":false,"receipts":[]}""");
        Assert.Single(list);
        Assert.Null(list[0].Total);
        Assert.Contains("not_a_receipt", list[0].Warnings);
    }

    [Fact]
    public void Parser_Caps_The_Number_Of_Receipts_Per_Photo()
    {
        var items = string.Join(",", Enumerable.Range(1, 15).Select(i => $"{{\"total\":{i}}}"));
        Assert.Equal(ReceiptParser.MaxReceiptsPerPhoto,
            ReceiptParser.ParseMany($"{{\"receipts\":[{items}]}}").Count);
    }

    [Fact]
    public void Parser_Accepts_A_Bare_Array_Of_Receipts()
    {
        var list = ReceiptParser.ParseMany("""[{"total":3},{"total":4}]""");
        Assert.Equal([3m, 4m], list.Select(r => r.Total));
    }

    [Fact]
    public void Parser_Accepts_A_Nested_Receipt_Object()
    {
        var s = ReceiptParser.Parse("""{"receipt":{"merchant":"Corner Cafe","total":31.4,"category":"food"}}""", UsdFood);
        Assert.Equal("Corner Cafe", s.Merchant);
        Assert.Equal(31.40m, s.Total);
        Assert.Equal("food", s.Category);
    }

    [Theory]
    [InlineData("2999-01-01", null, "date_invalid")]
    [InlineData("October 20", null, "date_invalid")]
    [InlineData("20261017", "2026-10-17", null)]
    public void Parser_Normalizes_And_Rejects_Dates(string raw, string? expected, string? warning)
    {
        var s = ReceiptParser.Parse($$"""{"total":5,"date":"{{raw}}"}""");
        Assert.Equal(expected is null ? null : DateOnly.Parse(expected), s.Date);
        if (warning is null) Assert.DoesNotContain("date_invalid", s.Warnings);
        else Assert.Contains(warning, s.Warnings);
    }

    [Fact]
    public void Parser_Filters_Categories_To_The_Group_List()
    {
        var s = ReceiptParser.Parse("""{"total":5,"category":"fuel"}""", UsdFood);
        Assert.Null(s.Category);
        Assert.Contains("category_unknown", s.Warnings);
    }

    [Fact]
    public void Parser_Ignores_Unknown_Confidence()
        => Assert.Null(ReceiptParser.Parse("""{"total":3,"confidence":"maybe"}""").Confidence.Total);

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

    private static IConfiguration OcrConfig(bool enabled = true, string? key = "test-key",
        string? baseUrl = "https://opencode.test/inference/openai/v1/", string? model = "gemini-3.5-flash-lite") =>
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Ocr:Enabled"] = enabled.ToString(),
            ["Ocr:BaseUrl"] = baseUrl,
            ["Ocr:Model"] = model,
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
    public async Task Provider_Sends_Context_Aware_OpenAi_Request()
    {
        var h = new FakeHandler(_ => Chat("""
            {"is_receipt":true,"merchant":"Cafe","total":4.5,"currency":"USD",
             "date":"2026-10-20","category":"food","confidence":{"total":"high"}}
            """));
        var s = (await Provider(h).ExtractAsync(Jpeg, "image/jpeg", UsdFood)).Single();

        Assert.Equal(4.50m, s.Total);
        Assert.Equal("Cafe", s.Merchant);
        Assert.Equal("USD", s.Currency);
        Assert.Equal("high", s.Confidence.Total);
        Assert.Equal("https://opencode.test/inference/openai/v1/chat/completions", h.Last!.RequestUri!.ToString());
        Assert.Equal("Bearer", h.Last.Headers.Authorization!.Scheme);
        Assert.Equal("test-key", h.Last.Headers.Authorization.Parameter);

        using var body = JsonDocument.Parse(h.LastBody!);
        Assert.Equal("gemini-3.5-flash-lite", body.RootElement.GetProperty("model").GetString());
        Assert.Equal("json_object", body.RootElement.GetProperty("response_format").GetProperty("type").GetString());
        var messages = body.RootElement.GetProperty("messages");
        var prompt = messages[0].GetProperty("content").GetString();
        Assert.Contains("grand total", prompt);
        Assert.Contains("group currency is USD", prompt);
        Assert.Contains("\"food\"", prompt);
        var url = messages[1].GetProperty("content")[1].GetProperty("image_url").GetProperty("url").GetString();
        Assert.Equal($"data:image/jpeg;base64,{Convert.ToBase64String(Jpeg)}", url);
    }

    [Fact]
    public async Task Provider_Allows_A_Keyless_Loopback_Endpoint()
    {
        var h = new FakeHandler(_ => Chat("""{"total":7}"""));
        var provider = Provider(h, OcrConfig(key: null, baseUrl: "http://localhost:11434/v1", model: "glm-ocr:latest"));
        Assert.True(provider.Enabled);

        var s = (await provider.ExtractAsync(Jpeg, "image/jpeg")).Single();
        Assert.Equal(7m, s.Total);
        Assert.Null(h.Last!.Headers.Authorization);
    }

    [Fact]
    public async Task Provider_Reads_Array_Content_Parts()
    {
        var h = new FakeHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("""{"choices":[{"message":{"content":[{"type":"text","text":"{\"total\":7}"}]}}]}""")
        });
        Assert.Equal(7m, (await Provider(h).ExtractAsync(Jpeg, "image/jpeg")).Single().Total);
    }

    [Theory]
    [InlineData(HttpStatusCode.Forbidden)] // provider free-tier / auth rejection
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
    public void Provider_Disabled_Without_Flag_Or_Configuration()
    {
        var h = new FakeHandler(_ => Chat("{}"));
        Assert.True(Provider(h).Enabled);
        Assert.False(Provider(h, OcrConfig(enabled: false)).Enabled);
        Assert.False(Provider(h, OcrConfig(key: null)).Enabled); // non-loopback needs a key
        Assert.False(Provider(h, OcrConfig(key: null, baseUrl: null)).Enabled);
        Assert.False(Provider(h, OcrConfig(model: null)).Enabled);
        Assert.False(new DisabledOcrService().Enabled);
    }

    // ---- ReceiptScanService ----

    private sealed class FakeOcr(bool enabled = true, Exception? fail = null,
        ReceiptSuggestion? suggestion = null, IReadOnlyList<ReceiptSuggestion>? suggestions = null) : IOcrService
    {
        public bool Enabled => enabled;
        public byte[]? Image;
        public OcrContext? Context;
        public Task<IReadOnlyList<ReceiptSuggestion>> ExtractAsync(byte[] image, string mime,
            OcrContext? context = null, CancellationToken ct = default)
        {
            if (fail is not null) throw fail;
            Image = image;
            Context = context;
            IReadOnlyList<ReceiptSuggestion> found = suggestions ?? [suggestion ?? new ReceiptSuggestion(
                9.99m, new ReceiptConfidence("high"), [], "Cafe", "USD", new DateOnly(2026, 10, 20), 1m, 0.5m,
                "food", "Cafe — 2026-10-20")];
            return Task.FromResult(found);
        }
    }

    private static async Task<(AppDbContext Db, Guid GroupId, Guid MemberId)> SeedAsync()
    {
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var member = Guid.NewGuid();
        var g = new Group { Name = "Trip", CreatedBy = member, Currency = "USD" };
        db.Groups.Add(g);
        db.GroupMembers.Add(new GroupMember { GroupId = g.Id, UserId = member, Role = "owner" });
        await db.SaveChangesAsync();
        return (db, g.Id, member);
    }

    private static ReceiptScanService Scanner(AppDbContext db, IOcrService ocr)
        => new(db, ocr, new CategoryService(db), NullLogger<ReceiptScanService>.Instance);

    [Fact]
    public async Task Scan_Returns_The_Additive_Dto()
    {
        var (db, gid, me) = await SeedAsync();
        var r = await Scanner(db, new FakeOcr()).ScanAsync(me, gid, "r.jpg", "image/jpeg", Jpeg);

        Assert.True(r.Ok);
        var options = new JsonSerializerOptions { PropertyNamingPolicy = new SnakeCaseNamingPolicy() };
        using var doc = JsonDocument.Parse(JsonSerializer.Serialize(
            ReceiptScanEndpoints.ToDto((IReadOnlyList<ReceiptSuggestion>)r.Data!), options));
        var root = doc.RootElement;
        Assert.Equal(1, root.GetProperty("count").GetInt32());
        var listed = root.GetProperty("receipts").EnumerateArray().Single();
        Assert.Equal("Cafe", listed.GetProperty("summary").GetString());
        Assert.Equal(9.99m, listed.GetProperty("amount_spent").GetDecimal());
        Assert.Equal(9.99m, root.GetProperty("total").GetDecimal());
        Assert.Equal("high", root.GetProperty("confidence").GetString());
        Assert.Empty(root.GetProperty("warnings").EnumerateArray());

        var receipt = root.GetProperty("receipt");
        Assert.Equal("Cafe", receipt.GetProperty("merchant").GetString());
        Assert.Equal(9.99m, receipt.GetProperty("total").GetDecimal());
        Assert.Equal("USD", receipt.GetProperty("currency").GetString());
        Assert.Equal("2026-10-20", receipt.GetProperty("date").GetString());
        Assert.Equal(1m, receipt.GetProperty("tax").GetDecimal());
        Assert.Equal(0.5m, receipt.GetProperty("tip").GetDecimal());
        Assert.Equal("food", receipt.GetProperty("category").GetString());
        Assert.Equal("high", receipt.GetProperty("confidence").GetProperty("total").GetString());
    }

    [Fact]
    public async Task Scan_Returns_Every_Receipt_From_One_Photo()
    {
        var (db, gid, me) = await SeedAsync();
        var ocr = new FakeOcr(suggestions:
        [
            new(43.25m, new ReceiptConfidence("high"), [], "India Bazaar", "USD",
                new DateOnly(2026, 10, 14), null, null, "food", "India Bazaar — 2026-10-14"),
            new(21.55m, new ReceiptConfidence("low"), [], "Harbour Market BP", "USD",
                new DateOnly(2026, 10, 15), null, null, "food", "Harbour Market BP — 2026-10-15")
        ]);
        var r = await Scanner(db, ocr).ScanAsync(me, gid, "two.jpg", "image/jpeg", Jpeg);

        Assert.True(r.Ok);
        var list = (IReadOnlyList<ReceiptSuggestion>)r.Data!;
        Assert.Equal(2, list.Count);
        Assert.Equal([43.25m, 21.55m], list.Select(x => x.Total));
        Assert.Equal("Harbour Market BP — 2026-10-15", list[1].Summary);

        var options = new JsonSerializerOptions { PropertyNamingPolicy = new SnakeCaseNamingPolicy() };
        using var doc = JsonDocument.Parse(JsonSerializer.Serialize(ReceiptScanEndpoints.ToDto(list), options));
        var root = doc.RootElement;
        Assert.Equal(2, root.GetProperty("count").GetInt32());
        Assert.Equal(2, root.GetProperty("receipts").GetArrayLength());
        Assert.Equal("India Bazaar — 2026-10-14",
            root.GetProperty("receipts")[0].GetProperty("summary").GetString());
        Assert.Equal(21.55m, root.GetProperty("receipts")[1].GetProperty("amount_spent").GetDecimal());
        Assert.Equal(43.25m, root.GetProperty("total").GetDecimal()); // legacy = first receipt
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
    public async Task Scan_Passes_Group_Context_And_Flags_A_Currency_Mismatch()
    {
        var (db, gid, me) = await SeedAsync();
        var ocr = new FakeOcr(suggestion: new ReceiptSuggestion(
            375000m, ReceiptConfidence.None, [], "VinMart", "VND", null, 25000m, null, "food"));
        var r = await Scanner(db, ocr).ScanAsync(me, gid, "r.jpg", "image/jpeg", Jpeg);

        Assert.True(r.Ok);
        Assert.Equal("USD", ocr.Context!.GroupCurrency);
        Assert.Contains("food", ocr.Context.CategoryKeys);
        Assert.Contains("currency_mismatch", ((IReadOnlyList<ReceiptSuggestion>)r.Data!)[0].Warnings);
    }

    [Fact]
    public async Task Scan_Does_Not_Flag_The_Group_Currency()
    {
        var (db, gid, me) = await SeedAsync();
        var ocr = new FakeOcr(suggestion: new ReceiptSuggestion(
            9.99m, ReceiptConfidence.None, [], "Cafe", "USD", null, null, null, "food"));
        var r = await Scanner(db, ocr).ScanAsync(me, gid, "r.jpg", "image/jpeg", Jpeg);

        Assert.DoesNotContain("currency_mismatch", ((IReadOnlyList<ReceiptSuggestion>)r.Data!)[0].Warnings);
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
/// Reads Ocr__ApiKey, optional Ocr__BaseUrl / Ocr__Model from the environment. A loopback
/// base URL (local Ollama) may omit the key.
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
        Assert.SkipUnless(env["OCR_LIVE_TEST"] == "1"
                && (!string.IsNullOrWhiteSpace(env["Ocr:ApiKey"])
                    || (env["Ocr:BaseUrl"] ?? "").Contains("localhost")),
            "Set OCR_LIVE_TEST=1 and Ocr__ApiKey (or a local Ocr__BaseUrl) to call the real provider.");
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Ocr:Enabled"] = "true",
            ["Ocr:BaseUrl"] = env["Ocr:BaseUrl"] ?? "https://generativelanguage.googleapis.com/v1beta/openai",
            ["Ocr:Model"] = env["Ocr:Model"] ?? "gemini-2.5-flash",
            ["Ocr:ApiKey"] = env["Ocr:ApiKey"],
        }).Build();
        var image = await File.ReadAllBytesAsync(Path.Combine(AppContext.BaseDirectory, "fixtures", "receipt-sample.jpg"),
            TestContext.Current.CancellationToken);

        var receipts = await new OpenAiCompatibleOcrService(new RealFactory(), config,
            NullLogger<OpenAiCompatibleOcrService>.Instance).ExtractAsync(image, "image/jpeg", null,
            TestContext.Current.CancellationToken);

        Assert.Contains(receipts, r => r.Total == 21.00m);
    }
}
