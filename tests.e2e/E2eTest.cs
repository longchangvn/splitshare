using System.Net;
using System.Text.Json;

namespace SplitShare.E2E;

/// <summary>
/// Base class for every E2E test class: joins the shared-host collection and hands
/// each test an authenticated-capable <see cref="E2eClient"/>. Deriving classes get
/// <c>[Fact]</c> methods that talk to the API only over HTTP.
/// </summary>
/// <remarks>Each class starts from the clean database created by <see cref="E2eApiFactory"/>;
/// classes must not depend on data created by another class.</remarks>
[Collection(E2eCollection.Name)]
public abstract class E2eTest(E2eApiFactory api)
{
    /// <summary>The shared in-process API host (email/OCR fakes hang off it).</summary>
    protected E2eApiFactory Api { get; } = api;

    /// <summary>HTTP client with snake_case JSON + auth shortcuts (no token until you sign in).</summary>
    protected E2eClient Client { get; } = new(api);

    /// <summary>A second, independent client — for two-party flows (invites, settlement).</summary>
    protected E2eClient NewClient() => new(Api);

    /// <summary>Anonymous GET against an endpoint that must not require auth.</summary>
    protected async Task<JsonElement> AnonymousGetAsync(string url)
    {
        var resp = await Api.CreateClient().GetAsync(url);
        var text = await resp.Content.ReadAsStringAsync();
        Assert.True(resp.StatusCode == HttpStatusCode.OK,
            $"Anonymous GET {url} expected 200 but got {(int)resp.StatusCode}: {text}");
        return System.Text.Json.JsonDocument.Parse(text).RootElement.Clone();
    }
}
