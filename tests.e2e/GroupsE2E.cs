using System.Net;
using System.Text.Json;

namespace SplitShare.E2E;

/// <summary>
/// Happy-path journeys across <c>api/Endpoints/GroupEndpoints.cs</c>: create/list/detail,
/// rename + settings, lifecycle status, categories, email invitations (preview → accept /
/// signed-in join), group-link join, rotate, member management (add / treasurer / deposit /
/// resplit removal / leave) and the public share link.
/// </summary>
public sealed class GroupsE2E(E2eApiFactory api) : E2eTest(api)
{
    /// <summary>Last path segment of an emailed/hosted link (/invite/&lt;token&gt;, /g/&lt;token&gt;).</summary>
    private static string TokenFromLink(string link) => link.Split('?')[0].TrimEnd('/').Split('/').Last();

    private async Task<(Guid GroupId, Guid OwnerId)> CreateGroupAsync(string? name = null)
    {
        await Client.RegisterAsync();
        var created = await Client.PostOkAsync("/api/v1/groups",
            new { Name = name ?? E2eClient.NewName("Group"), Currency = "USD" }, auth: true);
        return (created.GetProperty("group").GetProperty("id").GetGuid(),
            await E2eScenario.UserIdAsync(Client));
    }

    [Fact]
    public async Task Create_With_MemberIds_Is_Listed_And_Detailed()
    {
        var peer = NewClient();
        await peer.RegisterAsync();
        var peerId = await E2eScenario.UserIdAsync(peer);
        await Client.RegisterAsync();
        var name = E2eClient.NewName("Group");

        var created = await Client.PostOkAsync("/api/v1/groups",
            new { Name = name, Currency = "USD", MemberIds = new List<Guid> { peerId } }, auth: true);
        var group = created.GetProperty("group");
        var groupId = group.GetProperty("id").GetGuid();
        Assert.Equal(name, E2eClient.Str(group, "name"));
        Assert.Equal("USD", E2eClient.Str(group, "currency"));
        Assert.Equal("opening", E2eClient.Str(group, "status"));
        Assert.Equal("shared", E2eClient.Str(group, "mode"));
        Assert.Equal(1, created.GetProperty("added_members").GetInt32());
        Assert.Equal(0, created.GetProperty("pending_invites").GetInt32());
        Assert.Contains("/g/", E2eClient.Str(created, "invite_link"));

        var list = await Client.GetOkAsync("/api/v1/groups");
        Assert.Equal(JsonValueKind.Array, list.ValueKind);
        Assert.Contains(list.EnumerateArray(), g => g.GetProperty("group_id").GetGuid() == groupId);

        var detail = await Client.GetOkAsync($"/api/v1/groups/{groupId}");
        Assert.Equal(groupId, detail.GetProperty("group_id").GetGuid());
        Assert.Equal(name, E2eClient.Str(detail, "name"));
        Assert.Equal("owner", E2eClient.Str(detail, "my_role"));
        var members = detail.GetProperty("members").EnumerateArray().ToList();
        Assert.Equal(2, members.Count);
        var peerRow = Assert.Single(members.Where(m => m.GetProperty("user_id").GetGuid() == peerId).ToList());
        Assert.Equal("member", E2eClient.Str(peerRow, "role"));
        Assert.Equal(peerId, peerRow.GetProperty("user_id").GetGuid());
    }

    [Fact]
    public async Task Rename_And_Settings_Show_Up_In_The_Detail()
    {
        var (groupId, _) = await CreateGroupAsync();
        var renamed = E2eClient.NewName("Renamed");

        var renamedOk = await Client.PatchOkAsync($"/api/v1/groups/{groupId}", new { Name = renamed });
        Assert.Equal("ok", E2eClient.Str(renamedOk, "status"));

        var settingsOk = await Client.PatchOkAsync($"/api/v1/groups/{groupId}/settings", new
        {
            Budget = 250,
            BudgetAlertPct = 90,
            Mode = "trip",
        });
        Assert.Equal("ok", E2eClient.Str(settingsOk, "status"));

        var detail = await Client.GetOkAsync($"/api/v1/groups/{groupId}");
        Assert.Equal(renamed, E2eClient.Str(detail, "name"));
        Assert.Equal("trip", E2eClient.Str(detail, "mode"));
        var budget = detail.GetProperty("budget");
        Assert.Equal(25000, budget.GetProperty("budget_cents").GetInt64());
        Assert.Equal(0, budget.GetProperty("spent_cents").GetInt64());
        Assert.Equal(0m, budget.GetProperty("pct").GetDecimal());
        Assert.Equal(90, budget.GetProperty("alert_pct").GetInt32());
        Assert.False(budget.GetProperty("alert").GetBoolean());
        Assert.False(budget.GetProperty("over").GetBoolean());
    }

    [Fact]
    public async Task Status_Transitions_From_Opening_To_Locked()
    {
        var (groupId, _) = await CreateGroupAsync();
        var opening = await Client.GetOkAsync($"/api/v1/groups/{groupId}");
        Assert.Equal("opening", E2eClient.Str(opening, "status"));

        var locked = await Client.PatchOkAsync($"/api/v1/groups/{groupId}/status", new { Status = "locked" });
        Assert.Equal("locked", E2eClient.Str(locked, "status"));

        var after = await Client.GetOkAsync($"/api/v1/groups/{groupId}");
        Assert.Equal("locked", E2eClient.Str(after, "status"));
        Assert.Equal("owner", E2eClient.Str(after, "my_role"));
    }

    [Fact]
    public async Task Categories_Add_Rename_And_Delete()
    {
        var (groupId, _) = await CreateGroupAsync();

        var defaults = await Client.GetOkAsync($"/api/v1/groups/{groupId}/categories");
        Assert.Equal(4, defaults.GetArrayLength());
        var defaultKeys = defaults.EnumerateArray().Select(c => E2eClient.Str(c, "key")).ToList();
        Assert.Equal(new List<string> { "food", "stay", "transport", "other" }, defaultKeys);
        Assert.All(defaults.EnumerateArray(), c => Assert.True(c.GetProperty("is_default").GetBoolean()));

        var added = await Client.PostOkAsync($"/api/v1/groups/{groupId}/categories",
            new { Name = "Ski Rental" }, auth: true);
        var categoryId = added.GetProperty("category_id").GetGuid();
        Assert.Equal("ski_rental", E2eClient.Str(added, "key"));
        Assert.Equal("Ski Rental", E2eClient.Str(added, "name"));
        Assert.False(added.GetProperty("is_default").GetBoolean());

        var renamed = await Client.PatchOkAsync($"/api/v1/groups/{groupId}/categories/{categoryId}",
            new { Name = "Ski Rentals" });
        Assert.Equal("Ski Rentals", E2eClient.Str(renamed, "name"));
        var afterRename = await Client.GetOkAsync($"/api/v1/groups/{groupId}/categories");
        Assert.Equal(5, afterRename.GetArrayLength());
        Assert.Contains(afterRename.EnumerateArray(),
            c => c.GetProperty("category_id").GetGuid() == categoryId && E2eClient.Str(c, "name") == "Ski Rentals");

        var deleted = await Client.DeleteOkAsync($"/api/v1/groups/{groupId}/categories/{categoryId}");
        Assert.Equal("ok", E2eClient.Str(deleted, "status"));
        var afterDelete = await Client.GetOkAsync($"/api/v1/groups/{groupId}/categories");
        Assert.Equal(4, afterDelete.GetArrayLength());
        Assert.DoesNotContain(afterDelete.EnumerateArray(),
            c => c.GetProperty("category_id").GetGuid() == categoryId);
    }

    [Fact]
    public async Task Emailed_Invite_Preview_Then_Accept_Creates_The_Account()
    {
        var (groupId, _) = await CreateGroupAsync();
        var invitee = E2eClient.NewEmail();

        var invites = await Client.PostOkAsync($"/api/v1/groups/{groupId}/invites",
            new { Emails = new[] { invitee } }, auth: true);
        Assert.Contains(invites.GetProperty("pending").EnumerateArray(), e => e.GetString() == invitee);
        Assert.Equal(0, invites.GetProperty("added").GetArrayLength());
        var outcome = Assert.Single(invites.GetProperty("results").EnumerateArray().ToList());
        Assert.Equal("invited", E2eClient.Str(outcome, "status"));
        Assert.True(outcome.GetProperty("email_sent").GetBoolean());
        Assert.Equal("sent", E2eClient.Str(outcome, "email_status"));

        var token = TokenFromLink(Api.Emails.LatestLink(invitee, "/invite"));
        var preview = await AnonymousGetAsync($"/api/v1/invitations/{token}");
        Assert.Equal(invitee, E2eClient.Str(preview, "email"));
        Assert.Equal(1, preview.GetProperty("member_count").GetInt32());
        Assert.False(preview.GetProperty("account_exists").GetBoolean());
        Assert.False(preview.GetProperty("is_gmail").GetBoolean());

        var anon = NewClient();
        var resp = await anon.PostAsync($"/api/v1/invitations/{token}/accept",
            new { Password = E2eClient.NewPassword() });
        var accepted = await Client.ExpectAsync(resp, HttpStatusCode.Created);
        Assert.Equal(groupId, accepted.GetProperty("group_id").GetGuid());
        Assert.Equal(invitee, E2eClient.Str(accepted.GetProperty("user"), "email"));
        Assert.False(string.IsNullOrEmpty(E2eClient.Str(accepted, "access_token")));
        Assert.False(string.IsNullOrEmpty(E2eClient.Str(accepted, "refresh_token")));

        var joiner = NewClient();
        joiner.ApplyPair(accepted);
        var detail = await joiner.GetOkAsync($"/api/v1/groups/{groupId}");
        Assert.Equal("member", E2eClient.Str(detail, "my_role"));
        Assert.Equal(2, detail.GetProperty("members").GetArrayLength());
    }

    [Fact]
    public async Task Signed_In_Members_Join_Via_Invitation_And_Group_Link()
    {
        await Client.RegisterAsync();
        var joiner = NewClient();
        await joiner.RegisterAsync();

        // Emailed invitation consumed by an already signed-in account.
        var first = await Client.PostOkAsync("/api/v1/groups",
            new { Name = E2eClient.NewName("Group"), Currency = "USD" }, auth: true);
        var firstId = first.GetProperty("group").GetProperty("id").GetGuid();
        var invitee = E2eClient.NewEmail();
        await Client.PostOkAsync($"/api/v1/groups/{firstId}/invites",
            new { Emails = new[] { invitee } }, auth: true);
        var inviteToken = TokenFromLink(Api.Emails.LatestLink(invitee, "/invite"));
        var joined = await joiner.PostOkAsync($"/api/v1/invitations/{inviteToken}/join");
        Assert.Equal(firstId, joined.GetProperty("group_id").GetGuid());
        Assert.False(joined.GetProperty("already_member").GetBoolean());

        // Stable group invite link consumed through /groups/join.
        var second = await Client.PostOkAsync("/api/v1/groups",
            new { Name = E2eClient.NewName("Group"), Currency = "USD" }, auth: true);
        var secondId = second.GetProperty("group").GetProperty("id").GetGuid();
        var groupToken = TokenFromLink(E2eClient.Str(second, "invite_link"));
        var linked = await joiner.PostOkAsync("/api/v1/groups/join", new { Token = groupToken });
        Assert.Equal(secondId, linked.GetProperty("group_id").GetGuid());
        Assert.False(linked.GetProperty("already_member").GetBoolean());

        var list = await joiner.GetOkAsync("/api/v1/groups");
        var ids = list.EnumerateArray().Select(g => g.GetProperty("group_id").GetGuid()).ToList();
        Assert.Contains(firstId, ids);
        Assert.Contains(secondId, ids);
    }

    [Fact]
    public async Task Rotate_Invite_Invalidates_The_Old_Link()
    {
        var (groupId, _) = await CreateGroupAsync();
        var created = await Client.GetOkAsync($"/api/v1/groups/{groupId}");
        var oldToken = TokenFromLink(E2eClient.Str(created, "invite_link"));

        var rotated = await Client.PostOkAsync($"/api/v1/groups/{groupId}/rotate-invite", auth: true);
        var newLink = E2eClient.Str(rotated, "invite_link");
        var newToken = TokenFromLink(newLink);
        Assert.Contains("/g/", newLink);
        Assert.NotEqual(oldToken, newToken);

        var dead = await Api.CreateClient().GetAsync($"/api/v1/invites/{oldToken}");
        await Client.ExpectAsync(dead, HttpStatusCode.Gone);

        var preview = await AnonymousGetAsync($"/api/v1/invites/{newToken}");
        Assert.Equal(E2eClient.Str(created, "name"), E2eClient.Str(preview, "name"));
        Assert.Equal(1, preview.GetProperty("member_count").GetInt32());
    }

    [Fact]
    public async Task Add_Existing_Member_Set_Treasurer_And_Deposit()
    {
        var peer = NewClient();
        await peer.RegisterAsync();
        var peerId = await E2eScenario.UserIdAsync(peer);
        var (groupId, _) = await CreateGroupAsync();

        var added = await Client.PostOkAsync($"/api/v1/groups/{groupId}/members",
            new { UserIds = new List<Guid> { peerId } }, auth: true);
        Assert.Equal(new List<Guid> { peerId },
            added.GetProperty("user_ids").EnumerateArray().Select(g => g.GetGuid()).ToList());

        var role = await Client.PatchOkAsync($"/api/v1/groups/{groupId}/members/{peerId}",
            new { Role = "treasurer" });
        Assert.Equal("ok", E2eClient.Str(role, "status"));

        var deposit = await Client.PatchOkAsync($"/api/v1/groups/{groupId}/members/{peerId}/deposit",
            new { Paid = true });
        Assert.Equal("paid", E2eClient.Str(deposit, "status"));

        var detail = await Client.GetOkAsync($"/api/v1/groups/{groupId}");
        var members = detail.GetProperty("members").EnumerateArray().ToList();
        Assert.Equal(2, members.Count);
        var peerRow = Assert.Single(members.Where(m => m.GetProperty("user_id").GetGuid() == peerId).ToList());
        Assert.Equal("treasurer", E2eClient.Str(peerRow, "role"));
        Assert.True(peerRow.GetProperty("deposit_paid").GetBoolean());
    }

    [Fact]
    public async Task Removal_Preview_Then_Resplit_Removal_Takes_The_Balance_With_Them()
    {
        var member = NewClient();
        await member.RegisterAsync();
        var memberId = await E2eScenario.UserIdAsync(member);
        await Client.RegisterAsync();
        var ownerId = await E2eScenario.UserIdAsync(Client);
        var groupId = await E2eScenario.CreateGroupAsync(Client, member);

        // The member owes the owner (the owner paid their shared expense), so the
        // resplit rewrites that expense and the member leaves at a zero balance.
        var created = await E2eScenario.AddExpenseAsync(Client, groupId, 20m, E2eClient.NewName("Dinner"),
            new List<Guid> { ownerId, memberId });
        var expenseId = created.GetProperty("expense").GetProperty("expense_id").GetGuid();

        var preview = await Client.GetOkAsync($"/api/v1/groups/{groupId}/members/{memberId}/removal-preview");
        Assert.Equal(memberId, preview.GetProperty("user_id").GetGuid());
        Assert.Equal(-1000, preview.GetProperty("net_cents").GetInt64());
        Assert.Equal("resplit", E2eClient.Str(preview, "strategy"));
        Assert.True(preview.GetProperty("can_remove").GetBoolean());
        Assert.Equal(0, preview.GetProperty("blockers").GetArrayLength());
        Assert.Equal(1, preview.GetProperty("expenses").GetArrayLength());
        Assert.Equal("USD", E2eClient.Str(preview, "currency"));
        var hash = E2eClient.Str(preview, "inputs_hash");
        var netsAfter = preview.GetProperty("nets_after").EnumerateObject().ToList();
        var onlyOwner = Assert.Single(netsAfter);
        Assert.Equal(0L, onlyOwner.Value.GetInt64());

        var removed = await Client.DeleteOkAsync(
            $"/api/v1/groups/{groupId}/members/{memberId}?strategy=resplit&expected_hash={hash}");
        Assert.Equal("removed", E2eClient.Str(removed, "status"));
        Assert.Equal(1, removed.GetProperty("resplit_expenses").GetInt32());

        var detail = await Client.GetOkAsync($"/api/v1/groups/{groupId}");
        Assert.Single(detail.GetProperty("members").EnumerateArray().ToList());

        // The open expense was re-split onto the remaining participants only.
        var expense = await Client.GetOkAsync($"/api/v1/expenses/{expenseId}");
        var splits = expense.GetProperty("expense").GetProperty("splits").EnumerateArray().ToList();
        var remaining = Assert.Single(splits);
        Assert.Equal(ownerId, remaining.GetProperty("user_id").GetGuid());
        Assert.Equal(2000, remaining.GetProperty("share_cents").GetInt64());
    }

    [Fact]
    public async Task Member_With_No_Balance_Leaves_The_Group()
    {
        var member = NewClient();
        await member.RegisterAsync();
        await Client.RegisterAsync();
        var groupId = await E2eScenario.CreateGroupAsync(Client, "Leavable", member);

        var left = await member.PostOkAsync($"/api/v1/groups/{groupId}/leave");
        Assert.Equal("left", E2eClient.Str(left, "status"));

        var detail = await Client.GetOkAsync($"/api/v1/groups/{groupId}");
        Assert.Single(detail.GetProperty("members").EnumerateArray().ToList());
    }

    [Fact]
    public async Task Mint_Public_Share_Link_And_Read_It_Anonymously()
    {
        var (groupId, _) = await CreateGroupAsync();

        var minted = await Client.PostOkAsync($"/api/v1/groups/{groupId}/share-link", auth: true);
        var link = E2eClient.Str(minted, "invite_link");
        Assert.Contains("/s/", link);

        var detail = await Client.GetOkAsync($"/api/v1/groups/{groupId}");
        Assert.True(detail.GetProperty("has_share_link").GetBoolean());

        var shared = await AnonymousGetAsync($"/api/v1/shared/{TokenFromLink(link)}");
        Assert.Equal(E2eClient.Str(detail, "name"), E2eClient.Str(shared, "name"));
        Assert.Equal("USD", E2eClient.Str(shared, "currency"));
        Assert.Equal("shared", E2eClient.Str(shared, "mode"));
        Assert.Equal(1, shared.GetProperty("members").GetArrayLength());
        Assert.Equal(0, shared.GetProperty("transfers").GetArrayLength());
    }
}
