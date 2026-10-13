namespace SplitShare.Api.Expenses;

public interface IFileStore
{
    Task<string> SaveAsync(Guid expenseId, string fileName, string mime, Stream content);
    Task DeleteAsync(string storageKey);
    Task<(Stream Stream, string Mime)?> OpenAsync(string storageKey);
}

public sealed class LocalFileStore(IConfiguration config, ILogger<LocalFileStore> logger) : IFileStore
{
    private string Root => config["Uploads:Path"] ?? "./uploads";

    public async Task<string> SaveAsync(Guid expenseId, string fileName, string mime, Stream content)
    {
        var safe = string.Concat(fileName.Where(c => char.IsLetterOrDigit(c) || c is '.' or '-' or '_'));
        if (string.IsNullOrWhiteSpace(safe)) safe = "receipt";
        var key = Path.Combine(expenseId.ToString("N"), $"{Guid.NewGuid():N}_{safe}");
        var full = Path.Combine(Root, key);
        Directory.CreateDirectory(Path.GetDirectoryName(full)!);
        await using var fs = File.Create(full);
        await content.CopyToAsync(fs);
        logger.LogInformation("Stored {Key} ({Mime})", key, mime);
        return key;
    }

    public Task DeleteAsync(string storageKey)
    {
        var full = Path.Combine(Root, storageKey);
        if (File.Exists(full)) File.Delete(full);
        return Task.CompletedTask;
    }

    public Task<(Stream Stream, string Mime)?> OpenAsync(string storageKey)
    {
        var full = Path.Combine(Root, storageKey);
        if (!File.Exists(full)) return Task.FromResult<(Stream, string)?>(null);
        var mime = Path.GetExtension(full).ToLowerInvariant() switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".webp" => "image/webp",
            ".heic" => "image/heic",
            _ => "application/octet-stream"
        };
        return Task.FromResult<(Stream, string)?>((File.OpenRead(full), mime));
    }
}

/// <summary>
/// Strips metadata segments that may carry GPS (JPEG APPn/COM, PNG ancillary
/// chunks). Other formats pass through unchanged (logged).
/// </summary>
public static class ImageSanitizer
{
    public static byte[] Sanitize(byte[] bytes, string mime)
    {
        if (mime is "image/jpeg" or "image/jpg") return StripJpeg(bytes);
        if (mime == "image/png") return StripPng(bytes);
        return bytes;
    }

    private static byte[] StripJpeg(byte[] src)
    {
        // SOI(FFD8) then segments; drop APPn (FFE0-FFEF) + COM (FFFE), keep the rest.
        if (src.Length < 4 || src[0] != 0xFF || src[1] != 0xD8) return src;
        var out_ = new List<byte> { 0xFF, 0xD8 };
        var i = 2;
        while (i + 3 < src.Length)
        {
            if (src[i] != 0xFF) break; // scan data: copy rest verbatim
            var marker = src[i + 1];
            if (marker == 0xD9) { out_.AddRange([0xFF, 0xD9]); break; } // EOI
            if (marker == 0xDA) // SOS: rest is scan data, copy verbatim
            {
                out_.AddRange(src[i..]);
                break;
            }
            var len = (src[i + 2] << 8) | src[i + 3];
            var isMeta = (marker is >= 0xE0 and <= 0xEF) || marker == 0xFE;
            if (!isMeta) out_.AddRange(src[i..(i + 2 + len)]);
            i += 2 + len;
        }
        return out_.ToArray();
    }

    private static byte[] StripPng(byte[] src)
    {
        // Keep signature + critical chunks (IHDR, PLTE, IDAT, IEND); drop ancillary (tEXt, eXIF, ...).
        var sig = new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 };
        if (src.Length < 8 || !src[..8].SequenceEqual(sig)) return src;
        var out_ = new List<byte>(sig);
        var i = 8;
        while (i + 8 <= src.Length)
        {
            var len = (src[i] << 24) | (src[i + 1] << 16) | (src[i + 2] << 8) | src[i + 3];
            var type = System.Text.Encoding.ASCII.GetString(src, i + 4, 4);
            var end = i + 8 + len + 4;
            if (end > src.Length) break;
            if (type is "IHDR" or "PLTE" or "IDAT" or "IEND") out_.AddRange(src[i..end]);
            i = end;
            if (type == "IEND") break;
        }
        return out_.ToArray();
    }
}
