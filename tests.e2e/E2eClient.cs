using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace SplitShare.E2E;

/// <summary>
/// HTTP client for the API under test: snake_case JSON (wire format), bearer-token
/// management, and happy-path shortcuts for the flows every feature test needs
/// (register, OTP sign-in via the captured email, login, refresh).
/// </summary>
public sealed class E2eClient
{
    /// <summary>Wire format: snake_case property names, case-insensitive matching.</summary>
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public E2eClient(E2eApiFactory api)
    {
        Api = api;
        Http = api.CreateClient();
    }

    public E2eApiFactory Api { get; }
    public HttpClient Http { get; }

    public string? Email { get; private set; }
    public string? AccessToken { get; private set; }
    public string? RefreshToken { get; private set; }

    // ---------------------------------------------------------------- factories

    /// <summary>Fresh address per test — sidesteps OTP cooldowns (60 s/address, 5/hour).</summary>
    public static string NewEmail() => $"e2e-{Guid.NewGuid():N}@example.test";

    /// <summary>Meets the policy: ≥8 chars with a letter and a digit.</summary>
    public static string NewPassword() => $"Aa1{Guid.NewGuid():N}";

    public static string NewName(string prefix = "E2E")
    {
        var s = $"{prefix}-{Guid.NewGuid():N}";
        return s[..Math.Min(30, s.Length)]; // Users.Username allows up to 320; keep it tidy.
    }

    // ------------------------------------------------------------------ sending

    public Task<HttpResponseMessage> SendAsync(HttpMethod method, string url, object? body = null,
        bool auth = false, string? idempotencyKey = null)
    {
        var req = new HttpRequestMessage(method, url);
        if (body is not null) req.Content = JsonContent.Create(body, options: Json);
        if (auth && AccessToken is not null)
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", AccessToken);
        if (idempotencyKey is not null) req.Headers.TryAddWithoutValidation("Idempotency-Key", idempotencyKey);
        return Http.SendAsync(req);
    }

    public Task<HttpResponseMessage> PostAsync(string url, object? body = null, bool auth = false, string? idempotencyKey = null)
        => SendAsync(HttpMethod.Post, url, body, auth, idempotencyKey);

    /// <summary>Multipart upload (expense images, payment proofs).</summary>
    public async Task<HttpResponseMessage> UploadAsync(string url, string field, string fileName, byte[] bytes,
        string mime, bool auth = true)
    {
        // Keep the form alive until the request has been read: disposing it before
        // SendAsync completes closes the multipart content stream.
        using var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue(mime);
        form.Add(file, field, fileName);
        var req = new HttpRequestMessage(HttpMethod.Post, url) { Content = form };
        if (auth && AccessToken is not null)
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", AccessToken);
        return await Http.SendAsync(req);
    }

    // --------------------------------------------------------------- assertions

    /// <summary>Awaits and asserts 2xx, returning the parsed body.</summary>
    public async Task<JsonElement> OkAsync(Task<HttpResponseMessage> respTask) =>
        await OkAsync(await respTask);

    /// <summary>Parses the body as JSON; fails with the server's error envelope when not 2xx.</summary>
    public async Task<JsonElement> OkAsync(HttpResponseMessage resp)
    {
        var text = await resp.Content.ReadAsStringAsync();
        if (!resp.IsSuccessStatusCode)
            throw new InvalidOperationException(
                $"Expected 2xx from {resp.RequestMessage?.Method} {resp.RequestMessage?.RequestUri} " +
                $"but got {(int)resp.StatusCode}: {text}");
        return JsonDocument.Parse(text).RootElement.Clone();
    }

    public Task<JsonElement> GetOkAsync(string url, bool auth = true) =>
        OkAsync(SendAsync(HttpMethod.Get, url, auth: auth));

    public Task<JsonElement> PostOkAsync(string url, object? body = null, bool auth = false) =>
        OkAsync(PostAsync(url, body, auth));

    public Task<JsonElement> PatchOkAsync(string url, object? body = null, bool auth = true) =>
        OkAsync(SendAsync(HttpMethod.Patch, url, body, auth));

    public Task<JsonElement> PutOkAsync(string url, object? body = null, bool auth = true) =>
        OkAsync(SendAsync(HttpMethod.Put, url, body, auth));

    public Task<JsonElement> DeleteOkAsync(string url, bool auth = true) =>
        OkAsync(SendAsync(HttpMethod.Delete, url, auth: auth));

    /// <summary>Asserts an exact status and returns the parsed body (for happy/negative probes).</summary>
    public async Task<JsonElement> ExpectAsync(HttpResponseMessage resp, HttpStatusCode expected)
    {
        var text = await resp.Content.ReadAsStringAsync();
        Assert.True(resp.StatusCode == expected,
            $"Expected {(int)expected} from {resp.RequestMessage?.RequestUri} but got {(int)resp.StatusCode}: {text}");
        return string.IsNullOrWhiteSpace(text)
            ? default
            : JsonDocument.Parse(text).RootElement.Clone();
    }

    // ------------------------------------------------------------- happy paths

    /// <summary>Registers a new account and stores its token pair on this client.</summary>
    public async Task<JsonElement> RegisterAsync(string? email = null, string? password = null,
        string? displayName = null)
    {
        email ??= NewEmail();
        password ??= NewPassword();
        var pair = await PostOkAsync("/api/v1/auth/register", new
        {
            Email = email,
            Password = password,
            DisplayName = displayName ?? NewName("Tester"),
            Username = email,
        });
        Email = email;
        ApplyPair(pair);
        return pair;
    }

    /// <summary>Passwordless sign-in: request code → read it from the captured email → verify.</summary>
    public async Task<JsonElement> OtpSignInAsync(string? email = null)
    {
        email ??= NewEmail();
        await PostOkAsync("/api/v1/auth/otp/request", new { Email = email });
        var code = Api.Emails.LatestCode(email);
        var pair = await PostOkAsync("/api/v1/auth/otp/verify", new { Email = email, Code = code });
        Email = email;
        ApplyPair(pair);
        return pair;
    }

    public async Task<JsonElement> LoginAsync(string usernameOrEmail, string password)
    {
        var pair = await PostOkAsync("/api/v1/auth/login", new { UsernameOrEmail = usernameOrEmail, Password = password });
        ApplyPair(pair);
        return pair;
    }

    /// <summary>Rotates the refresh token (old one is revoked) and adopts the new pair.</summary>
    public async Task<JsonElement> RefreshAsync()
    {
        var pair = await PostOkAsync("/api/v1/auth/refresh", new { RefreshToken = RefreshToken });
        ApplyPair(pair);
        return pair;
    }

    /// <summary>Stores a token pair (register/OTP/login/refresh/invite-accept responses).</summary>
    public void ApplyPair(JsonElement pair)
    {
        AccessToken = pair.GetProperty("access_token").GetString();
        RefreshToken = pair.GetProperty("refresh_token").GetString();
        if (AccessToken is not null)
            Http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", AccessToken);
    }

    public void ClearAuth()
    {
        AccessToken = null;
        RefreshToken = null;
        Http.DefaultRequestHeaders.Authorization = null;
    }

    // ------------------------------------------------------------ json accessors

    public static string Str(JsonElement e, string name) =>
        e.GetProperty(name).GetString() ?? throw new InvalidOperationException($"'{name}' was null in {e}");

    public static Guid Id(JsonElement e, string name) => e.GetProperty(name).GetGuid();

    public static decimal Dec(JsonElement e, string name) => e.GetProperty(name).GetDecimal();
}
