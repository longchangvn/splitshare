using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using SplitShare.Api.Expenses;
namespace SplitShare.Tests;
public sealed class TmpOllamaLive
{
    private sealed class Real : IHttpClientFactory { public HttpClient CreateClient(string n) => new() { Timeout = TimeSpan.FromSeconds(120) }; }
    [Fact]
    public async Task All_Samples()
    {
        var cfg = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> {
            ["Ocr:Enabled"]="true", ["Ocr:BaseUrl"]="http://localhost:11434/v1", ["Ocr:Model"]="glm-ocr", ["Ocr:ResponseMode"]="text" }).Build();
        var svc = new OpenAiCompatibleOcrService(new Real(), cfg, NullLogger<OpenAiCompatibleOcrService>.Instance);
        var dir = "/Users/alexchang/Research/splitshare/.ocr-spike/receipts";
        var lines = new List<string>();
        foreach (var f in Directory.GetFiles(dir).OrderBy(x => x))
        {
            var r = (await svc.ExtractAsync(await File.ReadAllBytesAsync(f), "image/jpeg", new OcrContext("USD", ["food"]))).Single();
            lines.Add($"{Path.GetFileName(f)}: total={r.Total} cur={r.Currency} date={r.Date} merchant={r.Merchant} warn={string.Join(',', r.Warnings)}");
        }
        Assert.Fail(string.Join("\n", lines));
    }
}
