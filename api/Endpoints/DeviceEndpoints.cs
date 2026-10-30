using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SplitShare.Api.Auth;
using SplitShare.Api.Common;
using SplitShare.Api.Data;
using SplitShare.Api.Models;

namespace SplitShare.Api.Endpoints;

/// <summary>
/// Expo push token registration (spec 005 D2). A device belongs to exactly one
/// user; re-registering the same token upserts instead of duplicating. Mute
/// state is per device so one phone can silence a group without affecting the
/// account's other devices.
/// </summary>
public static class DeviceEndpoints
{
    public const string RateLimitPolicy = "push-device";

    private static Guid Me(ClaimsPrincipal p) => AuthEndpoints.CurrentUserId(p)!.Value;

    private static object Dto(PushDevice d) => new
    {
        device_id = d.Id,
        platform = d.Platform,
        muted_group_ids = d.MutedGroupIds(),
        created_at = d.CreatedAt,
        last_seen_at = d.LastSeenAt
    };

    public static void Map(RouteGroupBuilder api)
    {
        api.MapGet("/me/devices", async (ClaimsPrincipal p, AppDbContext db) =>
        {
            var rows = await db.PushDevices.Where(d => d.UserId == Me(p))
                .OrderBy(d => d.CreatedAt).ToListAsync();
            return Results.Ok(rows.Select(Dto).ToList());
        });

        api.MapPost("/me/devices", async (DeviceDto d, ClaimsPrincipal p, AppDbContext db) =>
        {
            var token = (d.Token ?? "").Trim();
            if (token.Length is < 10 or > 256 || token.Any(char.IsWhiteSpace))
                return ApiResults.Error("VALIDATION", "token must be 10-256 chars without whitespace.", 422);
            var platform = (d.Platform ?? "").Trim().ToLowerInvariant();
            if (platform is not ("ios" or "android"))
                return ApiResults.Error("VALIDATION", "platform must be ios|android.", 422);

            var muted = d.MutedGroupIds ?? [];
            if (muted.Count > 500)
                return ApiResults.Error("VALIDATION", "At most 500 muted groups per device.", 422);
            if (await InvalidGroupAsync(db, Me(p), muted) is { } badGroup)
                return ApiResults.Error("VALIDATION", $"muted group {badGroup} is not yours.", 422);

            var me = Me(p);
            var device = await db.PushDevices
                .FirstOrDefaultAsync(x => x.UserId == me && x.Token == token);
            var now = DateTime.UtcNow;
            if (device is null)
            {
                device = new PushDevice
                {
                    UserId = me, Token = token, Platform = platform,
                    MutedGroupIdsJson = JsonSerializer.Serialize(muted.Distinct().ToList()),
                    CreatedAt = now, LastSeenAt = now
                };
                db.PushDevices.Add(device);
            }
            else
            {
                // Same install re-registering (token refresh or app restart).
                device.Platform = platform;
                device.MutedGroupIdsJson = JsonSerializer.Serialize(muted.Distinct().ToList());
                device.LastSeenAt = now;
            }
            await db.SaveChangesAsync();
            return Results.Created($"/api/v1/me/devices/{device.Id}",
                new { device_id = device.Id, platform = device.Platform });
        }).RequireRateLimiting(RateLimitPolicy);

        api.MapPatch("/me/devices/{id:guid}", async (Guid id, MuteDto d,
            ClaimsPrincipal p, AppDbContext db) =>
        {
            var device = await db.PushDevices
                .FirstOrDefaultAsync(x => x.Id == id && x.UserId == Me(p));
            if (device is null) return ApiResults.Error("NOT_FOUND", "Device not found.", 404);
            var muted = d.MutedGroupIds ?? [];
            if (muted.Count > 500)
                return ApiResults.Error("VALIDATION", "At most 500 muted groups per device.", 422);
            if (await InvalidGroupAsync(db, Me(p), muted) is { } badGroup)
                return ApiResults.Error("VALIDATION", $"muted group {badGroup} is not yours.", 422);
            device.MutedGroupIdsJson = JsonSerializer.Serialize(muted.Distinct().ToList());
            device.LastSeenAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(Dto(device));
        });

        api.MapDelete("/me/devices/{id:guid}", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var device = await db.PushDevices
                .FirstOrDefaultAsync(x => x.Id == id && x.UserId == Me(p));
            if (device is null) return ApiResults.Error("NOT_FOUND", "Device not found.", 404);
            db.PushDevices.Remove(device);
            await db.SaveChangesAsync();
            return Results.Ok(new { status = "deleted" });
        });
    }

    private static async Task<Guid?> InvalidGroupAsync(AppDbContext db, Guid userId, List<Guid> groupIds)
    {
        if (groupIds.Count == 0) return null;
        var mine = await db.GroupMembers.Where(m => m.UserId == userId)
            .Select(m => m.GroupId).ToListAsync();
        foreach (var g in groupIds)
            if (!mine.Contains(g)) return g;
        return null;
    }

    public sealed record DeviceDto(string? Token, string? Platform, List<Guid>? MutedGroupIds);
    public sealed record MuteDto(List<Guid>? MutedGroupIds);
}
