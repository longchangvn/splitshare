namespace SplitShare.E2E;

/// <summary>
/// Receipt scanning against the deterministic fake OCR: the group scan endpoint
/// and the legacy single-receipt endpoint both read the real fixture image
/// through the API's sanitizer and answer with the known 21.00 receipt.
/// </summary>
public sealed class ReceiptScanE2E(E2eApiFactory api) : E2eTest(api)
{
    /// <summary>tests/fixtures/receipt-sample.jpg, located by walking up from the test bin.</summary>
    private static byte[] FixtureJpg()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var path = Path.Combine(dir.FullName, "tests", "fixtures", "receipt-sample.jpg");
            if (File.Exists(path)) return File.ReadAllBytes(path);
            dir = dir.Parent;
        }
        throw new FileNotFoundException($"tests/fixtures/receipt-sample.jpg not found above {AppContext.BaseDirectory}");
    }

    [Fact]
    public async Task ReceiptScan_Group_Scan_Returns_The_Fake_Receipt()
    {
        await Client.RegisterAsync();
        var groupId = await E2eScenario.CreateGroupAsync(Client);

        var fixture = FixtureJpg();
        var resp = await Client.UploadAsync($"/api/v1/groups/{groupId}/expenses/scan",
            "file", "receipt-sample.jpg", fixture, "image/jpeg");
        var body = await Client.OkAsync(resp);

        Assert.Equal(1, body.GetProperty("count").GetInt32());
        Assert.Equal(FakeOcrService.SampleTotal, body.GetProperty("total").GetDecimal());

        var first = body.GetProperty("receipts")[0];
        Assert.Equal(FakeOcrService.SampleTotal, first.GetProperty("total").GetDecimal());
        Assert.Equal(FakeOcrService.SampleTotal, first.GetProperty("amount_spent").GetDecimal());
        Assert.Equal("E2E Test Cafe", first.GetProperty("merchant").GetString());
        // The fake OCR stamps the group's currency on the receipt.
        Assert.Equal("USD", first.GetProperty("currency").GetString());

        // Legacy single-receipt card fields mirror the first receipt.
        var receipt = body.GetProperty("receipt");
        Assert.Equal(FakeOcrService.SampleTotal, receipt.GetProperty("total").GetDecimal());
        Assert.Equal("E2E Test Cafe", receipt.GetProperty("merchant").GetString());
        Assert.Equal(0, body.GetProperty("warnings").GetArrayLength());
    }

    [Fact]
    public async Task ReceiptScan_Legacy_Ocr_Endpoint_Returns_The_Dict_Shape()
    {
        await Client.RegisterAsync();

        var fixture = FixtureJpg();
        var resp = await Client.UploadAsync("/api/v1/expenses/ocr",
            "file", "receipt-sample.jpg", fixture, "image/jpeg");
        var body = await Client.OkAsync(resp);

        Assert.Equal(1, body.GetProperty("count").GetInt32());

        // Legacy shape: flat string map — { "total": "21.00" } — plus the receipt list.
        var suggestion = body.GetProperty("suggestion");
        Assert.Equal("21.00", suggestion.GetProperty("total").GetString());

        var receipts = body.GetProperty("receipts");
        Assert.Equal(1, receipts.GetArrayLength());
        Assert.Equal(FakeOcrService.SampleTotal, receipts[0].GetProperty("total").GetDecimal());
        Assert.Equal(FakeOcrService.SampleTotal, receipts[0].GetProperty("amount_spent").GetDecimal());
    }
}
