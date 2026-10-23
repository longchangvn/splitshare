using SplitShare.Api.Expenses;

namespace SplitShare.Tests;

public sealed class OcrTests
{
    [Fact]
    public void Parse_SplitsMultipleReceiptsByTotalLine()
    {
        var text = """
            WALMART
            Thank you for shopping
            GV MILK 1GAL 4.28
            TAX 14.00

            TOTAL $90.00

            99 RANCH MARKET
            SUBTOTAL 33.00
            TAX 2.00
            TOTAL $35.00
            """;
        Assert.Equal(
            [new ReceiptSummary("walmart items", 90m), new ReceiptSummary("99 ranch items", 35m)],
            ReceiptTextParser.Parse(text));
    }

    [Theory]
    [InlineData("STORE #12\nGrand Total: 1,234.50", "receipt items", 1234.50)]
    [InlineData("Costco Wholesale\ntotal 12.00", "costco wholesale items", 12.00)]
    public void Parse_HandlesTotalVariantsAndStoreNoise(string text, string summary, double total)
        => Assert.Equal([new ReceiptSummary(summary, (decimal)total)], ReceiptTextParser.Parse(text));

    [Theory]
    [InlineData("")]
    [InlineData("just a photo of a cat")]
    [InlineData("SHOP\nTOTAL $0.00")]
    public void Parse_ReturnsEmptyWhenNoValidTotal(string text) => Assert.Empty(ReceiptTextParser.Parse(text));
}
