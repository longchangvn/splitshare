namespace SplitShare.Api.Expenses;

/// <summary>Receipt OCR. Disabled by default; wire a provider to enable (see capabilities).</summary>
public interface IOcrService
{
    bool Enabled { get; }
    Task<Dictionary<string, string>> ExtractAsync(byte[] image, string mime);
}

public sealed class DisabledOcrService(IConfiguration config) : IOcrService
{
    public bool Enabled => config.GetValue<bool>("Ocr:Enabled");
    public Task<Dictionary<string, string>> ExtractAsync(byte[] image, string mime)
        => Task.FromResult(new Dictionary<string, string>());
}
