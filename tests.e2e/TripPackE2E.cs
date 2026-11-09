namespace SplitShare.E2E;

/// <summary>
/// Trip-pack happy paths: expense comments, nudging a debtor (email captured),
/// both activity feeds, and the owner's public share link read anonymously.
/// </summary>
public sealed class TripPackE2E(E2eApiFactory api) : E2eTest(api)
{
    // ------------------------------------------------------------------ scenes

    /// <summary>
    /// Two known display names (used by the public share assertions), a shared
    /// group and one 30.00 expense the owner paid with only the debtor
    /// participating — so the debtor owes the full 30.00.
    /// </summary>
    private async Task<(string OwnerName, string DebtorName, string GroupName, string DebtorEmail,
        Guid OwnerId, Guid DebtorId, Guid GroupId, Guid ExpenseId)> TripSceneAsync()
    {
        var ownerName = E2eClient.NewName("Owner");
        await Client.RegisterAsync(displayName: ownerName);
        var ownerId = await E2eScenario.UserIdAsync(Client);

        var debtorName = E2eClient.NewName("Debtor");
        var debtorEmail = E2eClient.NewEmail();
        var debtor = NewClient();
        await debtor.RegisterAsync(email: debtorEmail, displayName: debtorName);
        var debtorId = await E2eScenario.UserIdAsync(debtor);

        var groupName = E2eClient.NewName("Trip");
        var groupId = await E2eScenario.CreateGroupAsync(Client, groupName, debtor);

        var expense = await E2eScenario.AddExpenseAsync(Client, groupId, 30m, title: "Team dinner",
            participants: new[] { debtorId });
        var expenseId = E2eClient.Id(expense.GetProperty("expense"), "expense_id");
        Assert.Contains(debtorId,
            expense.GetProperty("unsettled_user_ids").EnumerateArray().Select(x => x.GetGuid()));
        return (ownerName, debtorName, groupName, debtorEmail, ownerId, debtorId, groupId, expenseId);
    }

    // ------------------------------------------------------------------- tests

    [Fact]
    public async Task TripPack_Expense_Comments_CRUD()
    {
        var (_, _, _, _, ownerId, _, _, expenseId) = await TripSceneAsync();

        var posted = await Client.PostOkAsync($"/api/v1/expenses/{expenseId}/comments",
            new { Body = "Was the tip included?" }, auth: true);
        var commentId = E2eClient.Id(posted, "comment_id");
        Assert.Equal("Was the tip included?", posted.GetProperty("body").GetString());
        Assert.True(posted.TryGetProperty("created_at", out _));

        var list = await Client.GetOkAsync($"/api/v1/expenses/{expenseId}/comments");
        Assert.Equal(1, list.GetArrayLength());
        Assert.Equal(commentId, E2eClient.Id(list[0], "comment_id"));
        Assert.Equal(ownerId, list[0].GetProperty("author_id").GetGuid());
        Assert.Equal("Was the tip included?", list[0].GetProperty("body").GetString());

        var deleted = await Client.DeleteOkAsync($"/api/v1/comments/{commentId}");
        Assert.Equal("deleted", deleted.GetProperty("status").GetString());
        Assert.Equal(0, (await Client.GetOkAsync($"/api/v1/expenses/{expenseId}/comments")).GetArrayLength());
    }

    [Fact]
    public async Task TripPack_Nudge_Debtor_Sends_An_Email()
    {
        var (_, _, _, debtorEmail, _, debtorId, groupId, _) = await TripSceneAsync();

        var resp = await Client.PostOkAsync($"/api/v1/groups/{groupId}/nudges",
            new { UserIds = new[] { debtorId } }, auth: true);
        var sent = resp.GetProperty("sent");
        Assert.Equal(1, sent.GetArrayLength());
        Assert.Equal(debtorId, E2eClient.Id(sent[0], "user_id"));

        // The debtor (net < 0) received the nudge mail.
        var mail = Api.Emails.LatestFor(debtorEmail, "nudge");
        Assert.Equal(debtorEmail, mail.To);
        Assert.Contains("settle", mail.Body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task TripPack_Activity_Feeds_Show_The_Groups_Work()
    {
        var (_, _, _, _, _, _, groupId, expenseId) = await TripSceneAsync();

        await Client.PostOkAsync($"/api/v1/expenses/{expenseId}/comments",
            new { Body = "Split looks right" }, auth: true);

        var groupFeed = await Client.GetOkAsync($"/api/v1/groups/{groupId}/activity");
        Assert.True(groupFeed.GetArrayLength() > 0);
        var kinds = groupFeed.EnumerateArray().Select(x => x.GetProperty("kind").GetString()).ToList();
        Assert.Contains("expense", kinds);
        Assert.Contains("comment", kinds);
        Assert.Contains(groupFeed.EnumerateArray(),
            row => row.GetProperty("text").GetString()!.Contains("Team dinner"));

        var meFeed = await Client.GetOkAsync("/api/v1/me/activity");
        var items = meFeed.GetProperty("items");
        Assert.True(items.GetArrayLength() > 0);
        Assert.Contains(items.EnumerateArray(),
            row => row.GetProperty("group_id").GetGuid() == groupId);
        Assert.Contains(items.EnumerateArray(),
            row => row.GetProperty("kind").GetString() == "expense");
    }

    [Fact]
    public async Task TripPack_Owner_Shares_Group_And_Public_Ledger_Is_Readable()
    {
        var (ownerName, debtorName, groupName, _, _, _, groupId, _) = await TripSceneAsync();

        var link = await Client.PostOkAsync($"/api/v1/groups/{groupId}/share-link", auth: true);
        var inviteLink = link.GetProperty("invite_link").GetString();
        Assert.NotNull(inviteLink);
        var token = inviteLink![(inviteLink.LastIndexOf('/') + 1)..];
        Assert.NotEmpty(token);

        // Anonymous read of the shared ledger.
        var shared = await AnonymousGetAsync($"/api/v1/shared/{token}");
        Assert.Equal(groupName, shared.GetProperty("name").GetString());
        Assert.Equal("USD", shared.GetProperty("currency").GetString());

        var members = shared.GetProperty("members");
        Assert.Equal(2, members.GetArrayLength());
        Assert.Equal(0L, members.EnumerateArray().Sum(m => m.GetProperty("net_cents").GetInt64()));

        // The optimizer settles the debtor's 30.00 to the owner in one transfer.
        var transfers = shared.GetProperty("transfers");
        Assert.Equal(1, transfers.GetArrayLength());
        Assert.Equal(debtorName, transfers[0].GetProperty("from").GetString());
        Assert.Equal(ownerName, transfers[0].GetProperty("to").GetString());
        Assert.Equal(3000L, transfers[0].GetProperty("amount_cents").GetInt64());
    }
}
