using System.Text.Json;

namespace SplitShare.E2E;

/// <summary>
/// Reusable scenario builders shared by every E2E test class: the multi-party
/// setup (users in one group, first expense, settlement) that most feature tests
/// need before they can assert anything interesting. Keep these generic — feature
/// specifics belong in the test classes.
/// </summary>
public static class E2eScenario
{
    /// <summary>The signed-in user's id (from <c>GET /api/v1/me</c>).</summary>
    public static async Task<Guid> UserIdAsync(E2eClient client) =>
        E2eClient.Id(await client.GetOkAsync("/api/v1/me"), "user_id");

    /// <summary>Creates a group owned by <paramref name="owner"/> and adds <paramref name="members"/> to it.</summary>
    public static async Task<Guid> CreateGroupAsync(E2eClient owner, params E2eClient[] members) =>
        await CreateGroupAsync(owner, E2eClient.NewName("Group"), members);

    public static async Task<Guid> CreateGroupAsync(E2eClient owner, string name, params E2eClient[] members)
    {
        var created = await owner.PostOkAsync("/api/v1/groups", new { Name = name, Currency = "USD" }, auth: true);
        var groupId = created.GetProperty("group").GetProperty("id").GetGuid();
        if (members.Length > 0)
        {
            var ids = new List<Guid>();
            foreach (var m in members) ids.Add(await UserIdAsync(m));
            await owner.PostOkAsync($"/api/v1/groups/{groupId}/members",
                new { UserIds = ids }, auth: true);
        }
        return groupId;
    }

    /// <summary>
    /// Creates an equal-split expense in an existing group and returns the response body
    /// ({ expense, unsettled_user_ids, settlement_version }).
    /// </summary>
    public static async Task<JsonElement> AddExpenseAsync(E2eClient payer, Guid groupId, decimal amount,
        string? title = null, IReadOnlyList<Guid>? participants = null)
    {
        var payerId = await UserIdAsync(payer);
        return await payer.PostOkAsync($"/api/v1/groups/{groupId}/expenses", new
        {
            Title = title ?? E2eClient.NewName("Expense"),
            Amount = amount,
            PayerId = payerId,
            SplitType = "equal",
            ParticipantIds = participants,
        }, auth: true);
    }
}
