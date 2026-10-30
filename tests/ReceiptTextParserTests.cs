using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using SplitShare.Api.Expenses;

namespace SplitShare.Tests;

/// <summary>Ocr:ResponseMode = text (local Ollama glm-ocr). Inputs are real glm-ocr transcriptions.</summary>
public sealed class ReceiptTextParserTests
{
    [Theory]
    [InlineData("TOTAL 19.98\nPaid: Card", "19.98")]
    [InlineData("TOTAL 142.00", "142.00")]
    [InlineData("Date: 2026-10-22\n\nLatte 6.25\nTip 1.00\n\nTOTAL 7.25", "7.25")]
    [InlineData("Date: 2026-10-17\n\nBreakfast 28.00\nTax 3.40\n\nTOTAL 31.40", "31.40")]
    [InlineData("SUBTOTAL 18.50\nTax 1.48\nTOTAL 19.98\nCASH 20.00\nCHANGE 0.02", "19.98")]
    [InlineData("TOTAL\n19.98", "19.98")]
    [InlineData("| **TOTAL** | 19.98 |", "19.98")]
    [InlineData("Total 21.00\nGRAND TOTAL 23.10", "23.10")]
    [InlineData("Tạm tính 350.000\nTổng cộng 375.000 đ", "375000")]
    public void Reads_The_Labelled_Total(string text, string expected)
    {
        var s = ReceiptTextParser.ParseMany(text).Single();
        Assert.Equal(decimal.Parse(expected, System.Globalization.CultureInfo.InvariantCulture), s.Total);
        Assert.Equal("low", s.Confidence.Total);
    }

    [Fact]
    public void Reads_Merchant_Date_And_Currency_When_Printed()
    {
        var s = ReceiptTextParser.ParseMany(
            "VINMART\n\nDate: 2026-10-21\n\nGroceries 350000\nTax 25000\n\nTOTAL 375000\n\nVND").Single();
        Assert.Equal(375000m, s.Total);
        Assert.Equal("VINMART", s.Merchant);
        Assert.Equal(new DateOnly(2026, 10, 21), s.Date);
        Assert.Equal("VND", s.Currency);
        Assert.Equal("VINMART — 2026-10-21", s.Summary);
    }

    [Fact]
    public void No_Total_Gives_A_Manual_Card()
    {
        var s = ReceiptTextParser.ParseMany(
            "Meeting Notes\n\nAttendees: Ana, Ben, Chi\n\nNext steps: book the venue").Single();
        Assert.Null(s.Total);
        Assert.Contains("total_missing", s.Warnings);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("   \n ")]
    public void Empty_Text_Is_A_Provider_Error(string? text)
        => Assert.Throws<OcrProviderException>(() => ReceiptTextParser.ParseMany(text));

    [Theory]
    [InlineData("1,234.50", "1234.50")]
    [InlineData("1.234,50", "1234.50")]
    [InlineData("120.000", "120000")]
    [InlineData("350,000", "350000")]
    [InlineData("1.234.567", "1234567")]
    [InlineData("19.98", "19.98")]
    [InlineData("7,5", "7.5")]
    public void Parses_Number_Formats(string raw, string expected)
        => Assert.Equal(decimal.Parse(expected, System.Globalization.CultureInfo.InvariantCulture),
            ReceiptTextParser.ParseNumber(raw));

    // ---- provider wiring ----

    private sealed class Capture(string content) : HttpMessageHandler
    {
        public string? Body;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Body = await request.Content!.ReadAsStringAsync(ct);
            return new(System.Net.HttpStatusCode.OK)
            {
                Content = new StringContent(JsonSerializer.Serialize(new
                {
                    choices = new[] { new { message = new { role = "assistant", content } } }
                }))
            };
        }
    }

    private sealed class Factory(HttpMessageHandler h) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(h, disposeHandler: false);
    }

    private static OpenAiCompatibleOcrService Service(Capture h, string? mode) => new(new Factory(h),
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Ocr:Enabled"] = "true",
            ["Ocr:BaseUrl"] = "http://localhost:11434/v1",
            ["Ocr:Model"] = "glm-ocr",
            ["Ocr:ResponseMode"] = mode,
        }).Build(), NullLogger<OpenAiCompatibleOcrService>.Instance);

    [Fact]
    public async Task Text_Mode_Sends_Native_Ocr_Prompt_Without_Json_Mode()
    {
        var h = new Capture("TOTAL 19.98\nPaid: Card");
        var s = (await Service(h, "text").ExtractAsync([0xFF, 0xD8], "image/jpeg",
            new OcrContext("USD", ["food"]), TestContext.Current.CancellationToken)).Single();

        Assert.Equal(19.98m, s.Total);
        using var body = JsonDocument.Parse(h.Body!);
        Assert.False(body.RootElement.TryGetProperty("response_format", out _));
        var messages = body.RootElement.GetProperty("messages");
        Assert.Equal(1, messages.GetArrayLength());
        Assert.Equal("Text Recognition:", messages[0].GetProperty("content")[0].GetProperty("text").GetString());
    }

    [Fact]
    public async Task Default_Mode_Is_Unchanged_Json_Prompt()
    {
        var h = new Capture("""{"is_receipt":true,"receipts":[{"amount_spent":4.5}]}""");
        var s = (await Service(h, null).ExtractAsync([0xFF, 0xD8], "image/jpeg",
            new OcrContext("USD", ["food"]), TestContext.Current.CancellationToken)).Single();

        Assert.Equal(4.50m, s.Total);
        using var body = JsonDocument.Parse(h.Body!);
        Assert.Equal(JsonSerializer.Serialize(OpenAiCompatibleOcrService.BuildRequest(
            "glm-ocr", [0xFF, 0xD8], "image/jpeg", new OcrContext("USD", ["food"]))), h.Body);
    }

    [Theory]
    [InlineData("http://localhost:11434/v1", true)]
    [InlineData("http://127.0.0.1:11434/v1", true)]
    [InlineData("https://opencode.ai/inference/openai/v1", false)]
    [InlineData(null, false)]
    public void Only_Loopback_Providers_Skip_The_Standard_Resilience_Handler(string? url, bool loopback)
        => Assert.Equal(loopback, OpenAiCompatibleOcrService.IsLoopback(url));
}
