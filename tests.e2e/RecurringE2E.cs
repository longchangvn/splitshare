namespace SplitShare.E2E;

/// <summary>
/// Recurring bills: an owner creates a due EQUAL rule, a group read materializes
/// it into exactly one expense, re-reads do not duplicate, and the rule can be
/// patched and deleted over HTTP.
/// </summary>
public sealed class RecurringE2E(E2eApiFactory api) : E2eTest(api)
{
    [Fact]
    public async Task Recurring_Rule_Materializes_Once_Then_Patches_And_Deletes()
    {
        await Client.RegisterAsync();
        var ownerId = await E2eScenario.UserIdAsync(Client);

        var member = NewClient();
        await member.RegisterAsync();
        var memberId = await E2eScenario.UserIdAsync(member);

        var groupId = await E2eScenario.CreateGroupAsync(Client, member);

        // Owner creates a weekly rule whose first run is already due (past starts_at).
        var startsAt = DateTime.UtcNow.AddDays(-7);
        var rule = await Client.PostOkAsync($"/api/v1/groups/{groupId}/recurring", new
        {
            Title = "Weekly rent",
            Amount = 12.50m,
            SplitType = "EQUAL",
            PayerId = ownerId,
            ParticipantIds = new[] { ownerId, memberId },
            Frequency = "weekly",
            StartsAt = startsAt,
        }, auth: true);
        var ruleId = E2eClient.Id(rule, "rule_id");
        Assert.Equal(groupId, rule.GetProperty("group_id").GetGuid());
        Assert.Equal("Weekly rent", rule.GetProperty("title").GetString());
        Assert.Equal(1250L, rule.GetProperty("amount_cents").GetInt64());
        Assert.Equal("EQUAL", rule.GetProperty("split_type").GetString());
        Assert.Equal("weekly", rule.GetProperty("frequency").GetString());
        Assert.True(rule.GetProperty("active").GetBoolean());
        Assert.True(rule.GetProperty("next_run_at").GetDateTime() < DateTime.UtcNow,
            "starts_at is in the past, so the rule is due on the next read");

        var before = await Client.GetOkAsync($"/api/v1/groups/{groupId}/recurring");
        Assert.Equal(1, before.GetArrayLength());

        // Reading the group materializes the due rule into one expense.
        var detail = await Client.GetOkAsync($"/api/v1/groups/{groupId}");
        Assert.Equal(groupId, detail.GetProperty("group_id").GetGuid());
        Assert.Equal("opening", detail.GetProperty("status").GetString());

        var ledger = await Client.GetOkAsync($"/api/v1/groups/{groupId}/ledger");
        Assert.Equal(1, ledger.GetProperty("total").GetInt32());
        var item = ledger.GetProperty("items")[0];
        Assert.Equal("expense", item.GetProperty("kind").GetString());
        Assert.Equal("Weekly rent", item.GetProperty("title").GetString());
        Assert.Equal(1250L, item.GetProperty("amount_cents").GetInt64());

        var expense = await Client.GetOkAsync($"/api/v1/expenses/{E2eClient.Id(item, "id")}");
        var created = expense.GetProperty("expense");
        Assert.Equal("Recurring", created.GetProperty("description").GetString());
        Assert.Equal("OPEN", created.GetProperty("status").GetString());

        // The rule cursor advanced: reading again must not create a second expense.
        await Client.GetOkAsync($"/api/v1/groups/{groupId}");
        var ledgerAgain = await Client.GetOkAsync($"/api/v1/groups/{groupId}/ledger");
        Assert.Equal(1, ledgerAgain.GetProperty("total").GetInt32());
        var stamped = await Client.GetOkAsync($"/api/v1/groups/{groupId}/recurring");
        Assert.Equal(1, stamped.GetArrayLength());
        Assert.True(stamped[0].TryGetProperty("last_run_at", out _),
            "materialization stamps last_run_at on the rule");

        // Owner patches title, amount and the active flag.
        var patched = await Client.PatchOkAsync($"/api/v1/groups/{groupId}/recurring/{ruleId}", new
        {
            Title = "Weekly rent v2",
            Amount = 15.50m,
            Active = false,
        }, auth: true);
        Assert.Equal("Weekly rent v2", patched.GetProperty("title").GetString());
        Assert.Equal(1550L, patched.GetProperty("amount_cents").GetInt64());
        Assert.False(patched.GetProperty("active").GetBoolean());

        var afterPatch = await Client.GetOkAsync($"/api/v1/groups/{groupId}/recurring");
        Assert.Equal(1, afterPatch.GetArrayLength());
        Assert.Equal("Weekly rent v2", afterPatch[0].GetProperty("title").GetString());
        Assert.False(afterPatch[0].GetProperty("active").GetBoolean());

        // Delete removes it from the list entirely.
        var deleted = await Client.DeleteOkAsync($"/api/v1/groups/{groupId}/recurring/{ruleId}");
        Assert.Equal("deleted", deleted.GetProperty("status").GetString());
        var afterDelete = await Client.GetOkAsync($"/api/v1/groups/{groupId}/recurring");
        Assert.Equal(0, afterDelete.GetArrayLength());
    }
}
