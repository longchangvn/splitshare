using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using SplitShare.Api.Data;
using SplitShare.Api.Models;
using SplitShare.Api.Notifications;

namespace SplitShare.Tests;

/// <summary>Spec 005 A2/A3: device registration, per-group mute and Expo delivery.</summary>
public sealed class PushDeviceTests
{
    private sealed class CaptureHandler(Func<HttpResponseMessage> respond) : HttpMessageHandler
    {
        public readonly List<string> Bodies = [];
        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken ct)
        {
            if (request.Content is not null)
                Bodies.Add(await request.Content.ReadAsStringAsync(ct));
            return respond();
        }
    }

    private sealed class FakeHttp : IHttpClientFactory
    {
        private readonly CaptureHandler _handler;
        public FakeHttp(CaptureHandler handler) => _handler = handler;
        public HttpClient CreateClient(string name) => new(_handler);
    }

    private static AppDbContext Db()
        => new(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    private static IConfiguration Cfg(string? endpoint = null) => new ConfigurationBuilder()
        .AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Notification:Provider"] = "expo",
            ["Notification:Expo:Endpoint"] = endpoint ?? "https://expo.test/send",
        }).Build();

    private static HttpResponseMessage Ok(string body = "{\"data\":[{\"status\":\"ok\"}]}")
        => new(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    [Fact]
    public void Mute_Json_RoundTrips_And_Malformed_Is_Empty()
    {
        var id = Guid.NewGuid();
        var device = new PushDevice();
        Assert.Empty(device.MutedGroupIds());

        device.MutedGroupIdsJson = JsonSerializer.Serialize(new[] { id });
        Assert.Equal(new[] { id }, device.MutedGroupIds());

        device.MutedGroupIdsJson = "not-json";
        Assert.Empty(device.MutedGroupIds());
    }

    [Fact]
    public async Task Provider_Skips_Devices_That_Muted_The_Group()
    {
        var db = Db();
        var user = Guid.NewGuid();
        var group = Guid.NewGuid();
        db.PushDevices.AddRange(
            new PushDevice { UserId = user, Token = "ExponentPushToken[muted]", Platform = "ios", MutedGroupIdsJson = JsonSerializer.Serialize(new[] { group }) },
            new PushDevice { UserId = user, Token = "ExponentPushToken[active]", Platform = "android" });
        await db.SaveChangesAsync();

        var handler = new CaptureHandler(() => Ok());
        var provider = new ExpoPushProvider(new FakeHttp(handler), db, Cfg(), NullLogger<ExpoPushProvider>.Instance);
        await provider.SendToUsersAsync([user], new NotificationMessage("T", "B", "splitshare://groups/x", group));

        var body = Assert.Single(handler.Bodies);
        Assert.Contains("ExponentPushToken[active]", body);
        Assert.DoesNotContain("ExponentPushToken[muted]", body);
        Assert.Contains(group.ToString("D"), body);
        Assert.Contains("splitshare://groups/x", body);
    }

    [Fact]
    public async Task Provider_Sends_Everything_When_No_Group_Is_Set()
    {
        var db = Db();
        var user = Guid.NewGuid();
        var group = Guid.NewGuid();
        db.PushDevices.Add(new PushDevice
        {
            UserId = user, Token = "ExponentPushToken[muted]", Platform = "ios",
            MutedGroupIdsJson = JsonSerializer.Serialize(new[] { group })
        });
        await db.SaveChangesAsync();

        var handler = new CaptureHandler(() => Ok());
        var provider = new ExpoPushProvider(new FakeHttp(handler), db, Cfg(), NullLogger<ExpoPushProvider>.Instance);
        await provider.SendToUsersAsync([user], new NotificationMessage("T", "B"));

        var body = Assert.Single(handler.Bodies);
        Assert.Contains("ExponentPushToken[muted]", body);
    }

    [Fact]
    public async Task Unregistered_Tokens_Are_Forgotten()
    {
        var db = Db();
        var user = Guid.NewGuid();
        db.PushDevices.Add(new PushDevice { UserId = user, Token = "ExponentPushToken[dead]", Platform = "ios" });
        await db.SaveChangesAsync();

        var handler = new CaptureHandler(() => Ok(
            "{\"data\":[{\"status\":\"error\",\"details\":{\"error\":\"DeviceNotRegistered\"}}]}"));
        var provider = new ExpoPushProvider(new FakeHttp(handler), db, Cfg(), NullLogger<ExpoPushProvider>.Instance);
        await provider.SendToUsersAsync([user], new NotificationMessage("T", "B"));

        Assert.Empty(db.PushDevices);
    }

    [Fact]
    public async Task Large_Audiences_Are_Batched_At_100()
    {
        var db = Db();
        var users = new List<Guid>();
        for (var i = 0; i < 150; i++)
        {
            var user = Guid.NewGuid();
            users.Add(user);
            db.PushDevices.Add(new PushDevice { UserId = user, Token = $"ExponentPushToken[{i}]", Platform = "ios" });
        }
        await db.SaveChangesAsync();

        var handler = new CaptureHandler(() => Ok());
        var provider = new ExpoPushProvider(new FakeHttp(handler), db, Cfg(), NullLogger<ExpoPushProvider>.Instance);
        await provider.SendToUsersAsync(users, new NotificationMessage("T", "B"));

        Assert.Equal(2, handler.Bodies.Count);
        Assert.Equal(100, CountTokens(handler.Bodies[0]));
        Assert.Equal(50, CountTokens(handler.Bodies[1]));
    }

    [Fact]
    public async Task Transport_Failure_Never_Throws()
    {
        var db = Db();
        var user = Guid.NewGuid();
        db.PushDevices.Add(new PushDevice { UserId = user, Token = "ExponentPushToken[x]", Platform = "ios" });
        await db.SaveChangesAsync();

        var handler = new CaptureHandler(() => new HttpResponseMessage(HttpStatusCode.InternalServerError)
        {
            Content = new StringContent("nope", Encoding.UTF8, "text/plain")
        });
        var provider = new ExpoPushProvider(new FakeHttp(handler), db, Cfg(), NullLogger<ExpoPushProvider>.Instance);
        await provider.SendToUsersAsync([user], new NotificationMessage("T", "B")); // must not throw

        // A broken endpoint is also swallowed.
        var throwing = new ExpoPushProvider(new FakeHttp(handler), db, Cfg("https://expo.test/send"), NullLogger<ExpoPushProvider>.Instance);
        await throwing.SendToUsersAsync([user], new NotificationMessage("T", "B"));
    }

    [Fact]
    public async Task No_Devices_Means_No_Request()
    {
        var db = Db();
        var handler = new CaptureHandler(() => Ok());
        var provider = new ExpoPushProvider(new FakeHttp(handler), db, Cfg(), NullLogger<ExpoPushProvider>.Instance);
        await provider.SendToUsersAsync([Guid.NewGuid()], new NotificationMessage("T", "B"));
        Assert.Empty(handler.Bodies);
    }

    [Fact]
    public void Factory_Requires_HttpClient_And_DbContext_For_Expo()
    {
        Assert.Throws<InvalidOperationException>(() => NotificationProviderFactory.Create(Cfg()));
    }

    private static int CountTokens(string body)
    {
        using var doc = JsonDocument.Parse(body);
        return doc.RootElement.GetArrayLength();
    }
}
