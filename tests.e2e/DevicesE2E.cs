namespace SplitShare.E2E;

/// <summary>Expo push token lifecycle: register (upsert), list, mute a group, delete.</summary>
public sealed class DevicesE2E(E2eApiFactory api) : E2eTest(api)
{
    [Fact]
    public async Task Devices_Register_Mute_And_Delete_Lifecycle()
    {
        await Client.RegisterAsync();
        var groupId = await E2eScenario.CreateGroupAsync(Client);

        var token = $"ExpoPushToken[e2e-{Guid.NewGuid():N}]";
        var created = await Client.PostOkAsync("/api/v1/me/devices",
            new { Token = token, Platform = "ios" }, auth: true);
        var deviceId = E2eClient.Id(created, "device_id");
        Assert.Equal("ios", created.GetProperty("platform").GetString());

        // Same token again (app restart / token refresh) upserts instead of duplicating.
        var again = await Client.PostOkAsync("/api/v1/me/devices",
            new { Token = token, Platform = "ios" }, auth: true);
        Assert.Equal(deviceId, E2eClient.Id(again, "device_id"));

        var list = await Client.GetOkAsync("/api/v1/me/devices");
        Assert.Equal(1, list.GetArrayLength());
        Assert.Equal(deviceId, E2eClient.Id(list[0], "device_id"));
        Assert.Equal("ios", list[0].GetProperty("platform").GetString());

        // Mute one of the account's own groups on this device.
        var patched = await Client.PatchOkAsync($"/api/v1/me/devices/{deviceId}",
            new { MutedGroupIds = new[] { groupId } }, auth: true);
        Assert.Equal(deviceId, E2eClient.Id(patched, "device_id"));
        var muted = patched.GetProperty("muted_group_ids");
        Assert.Equal(1, muted.GetArrayLength());
        Assert.Equal(groupId, muted[0].GetGuid());

        var afterMute = await Client.GetOkAsync("/api/v1/me/devices");
        Assert.Equal(1, afterMute.GetArrayLength());
        Assert.Equal(groupId, afterMute[0].GetProperty("muted_group_ids")[0].GetGuid());

        var deleted = await Client.DeleteOkAsync($"/api/v1/me/devices/{deviceId}");
        Assert.Equal("deleted", deleted.GetProperty("status").GetString());
        Assert.Equal(0, (await Client.GetOkAsync("/api/v1/me/devices")).GetArrayLength());
    }
}
