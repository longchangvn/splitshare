using System.Security.Claims;
using SplitShare.Api.Auth;
using SplitShare.Api.Common;
using SplitShare.Api.Services;

namespace SplitShare.Api.Endpoints;

/// <summary>
/// Cross-group activity (spec 005 D1). One request per page replaces the web
/// client's 2×N fan-out; the per-group endpoint keeps its existing contract.
/// </summary>
public static class ActivityEndpoints
{
    public static void Map(RouteGroupBuilder api)
    {
        api.MapGet("/me/activity", async (int? limit, DateTime? before, Guid? group_id,
            ClaimsPrincipal p, ActivityService activity) =>
        {
            var me = AuthEndpoints.CurrentUserId(p);
            if (me is null) return ApiResults.Error("UNAUTH", "Not authenticated.", 401);
            var take = Math.Clamp(limit ?? 20, 1, 50);
            var (items, nextBefore) = await activity.UserFeedAsync(me.Value, take, before, group_id);
            return Results.Ok(new
            {
                items = items.Select(r => new
                {
                    kind = r.Kind,
                    at = r.At,
                    text = r.Text,
                    group_id = r.GroupId,
                    group_name = r.GroupName,
                    @ref = r.Ref
                }).ToList(),
                next_before = nextBefore
            });
        });
    }
}
