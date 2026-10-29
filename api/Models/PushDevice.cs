using System.Text.Json;

namespace SplitShare.Api.Models;

/// <summary>
/// One Expo push token per app install (spec 005 D2). The token is the routing
/// key; the user id is the owner. Muted groups are stored as a JSON array so a
/// device can opt out per group without touching other members' devices.
/// </summary>
public sealed class PushDevice
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string Token { get; set; } = "";
    public string Platform { get; set; } = "ios"; // ios|android
    public string MutedGroupIdsJson { get; set; } = "[]"; // Guid[]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime LastSeenAt { get; set; } = DateTime.UtcNow;

    /// <summary>Group ids this install has muted; malformed JSON means "nothing muted".</summary>
    public List<Guid> MutedGroupIds()
    {
        try { return JsonSerializer.Deserialize<List<Guid>>(MutedGroupIdsJson) ?? []; }
        catch (JsonException) { return []; }
    }
}
