using SplitShare.Api.Expenses;

namespace SplitShare.Tests;

public sealed class SplitTests
{
    private static readonly Guid U1 = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid U2 = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid U3 = Guid.Parse("33333333-3333-3333-3333-333333333333");

    [Fact]
    public void Equal_Remainder_ToLowestUserId()
    {
        var r = SplitService.Equal(1000, [U3, U1, U2]);
        Assert.Equal(334, r[U1]); // lowest id gets +1c
        Assert.Equal(333, r[U2]);
        Assert.Equal(333, r[U3]);
        Assert.Equal(1000, r.Values.Sum());
    }

    [Fact]
    public void Exact_Mismatch_ReturnsDiff()
    {
        var (s, e) = SplitService.Exact(1000, [new(U1, 600), new(U2, 300)]);
        Assert.Null(s);
        Assert.Contains("diff", e);
        var (ok, _) = SplitService.Exact(1000, [new(U1, 600), new(U2, 400)]);
        Assert.Equal(1000, ok!.Values.Sum());
    }

    [Fact]
    public void Percent_LargestRemainder_SumsExactly()
    {
        var (s, e) = SplitService.Percent(1000,
            [new(U1, 33.33m), new(U2, 33.33m), new(U3, 33.34m)]);
        Assert.Null(e);
        Assert.Equal(1000, s!.Values.Sum());
        var (bad, err) = SplitService.Percent(1000, [new(U1, 50m), new(U2, 40m)]);
        Assert.Null(bad);
        Assert.Contains("100.00", err);
    }

    [Fact]
    public void Shares_Proportional_AndExact()
    {
        var (s, e) = SplitService.Shares(1000, [new(U1, 1), new(U2, 1), new(U3, 1)]);
        Assert.Null(e);
        Assert.Equal(1000, s!.Values.Sum());
        Assert.Equal(334, s[U1]); // 1c remainder to lowest id; others 333
        Assert.Equal(333, s[U2]);
    }

    [Fact]
    public void Sanitizer_StripsJpegAppSegments_KeepsImage()
    {
        // Minimal JPEG: SOI + APP1(len 8) + DQT(len 7: 5 data bytes) + SOS + 2 data bytes + EOI.
        var jpeg = new byte[] {
            0xFF,0xD8, 0xFF,0xE1,0x00,0x08,0x45,0x78,0x69,0x66,0x00,0x00,
            0xFF,0xDB,0x00,0x07,0x01,0x02,0x03,0x04,0x05,
            0xFF,0xDA,0xAA,0xBB, 0xFF,0xD9 };
        var clean = ImageSanitizer.Sanitize(jpeg, "image/jpeg");
        Assert.Equal([0xFF, 0xD8], clean[..2]); // SOI kept
        Assert.DoesNotContain((byte)0xE1, clean[2..4]); // APP1 gone
        Assert.Equal([0xFF, 0xD9], clean[^2..]); // EOI kept
        Assert.Contains(clean, b => b == 0xDB); // DQT kept
    }

    [Fact]
    public void Sanitizer_StripsPngAncillary_KeepsCritical()
    {
        byte[] chunk(string type, byte[] data)
        {
            var len = new byte[] { 0, 0, 0, (byte)data.Length };
            return [.. len, .. System.Text.Encoding.ASCII.GetBytes(type), .. data, 0, 0, 0, 0];
        }
        var png = new byte[] { 137,80,78,71,13,10,26,10 };
        png = [.. png, .. chunk("IHDR", new byte[13]), .. chunk("tEXt", [1,2,3]),
               .. chunk("IDAT", [4,5]), .. chunk("IEND", [])];
        var clean = ImageSanitizer.Sanitize(png, "image/png");
        var text = System.Text.Encoding.ASCII.GetString(clean);
        Assert.DoesNotContain("tEXt", text);
        Assert.Contains("IHDR", text);
        Assert.Contains("IDAT", text);
    }
}
