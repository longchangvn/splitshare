using System.Net;

namespace SplitShare.E2E;

/// <summary>
/// Payment happy paths: record a partial payment, settle the group fully, reverse
/// a payment inside the window, round-trip a proof image, and manage the
/// account's payment handles (including shared-group visibility).
/// </summary>
public sealed class PaymentsE2E(E2eApiFactory api) : E2eTest(api)
{
    // ------------------------------------------------------------------ scenes

    /// <summary>
    /// Owner + debtor share a group with one expense the owner paid but did not
    /// participate in, so the debtor owes <paramref name="amount"/> in full.
    /// </summary>
    private async Task<(Guid OwnerId, Guid DebtorId, Guid GroupId, Guid ExpenseId)> OwedSceneAsync(decimal amount)
    {
        await Client.RegisterAsync();
        var ownerId = await E2eScenario.UserIdAsync(Client);

        var debtor = NewClient();
        await debtor.RegisterAsync();
        var debtorId = await E2eScenario.UserIdAsync(debtor);

        var groupId = await E2eScenario.CreateGroupAsync(Client, debtor);
        var expense = await E2eScenario.AddExpenseAsync(Client, groupId, amount,
            participants: new[] { debtorId });

        Assert.Equal(amount * 100m, E2eClient.Dec(expense.GetProperty("expense"), "amount_cents"));
        var unsettled = expense.GetProperty("unsettled_user_ids").EnumerateArray()
            .Select(x => x.GetGuid()).ToList();
        Assert.True(unsettled.Contains(debtorId),
            "the debtor is unsettled right after the expense");
        return (ownerId, debtorId, groupId, E2eClient.Id(expense.GetProperty("expense"), "expense_id"));
    }

    private Task<System.Text.Json.JsonElement> RecordAsync(Guid groupId, Guid from, Guid to, decimal amount, string method) =>
        Client.PostOkAsync($"/api/v1/groups/{groupId}/payments", new
        {
            FromUserId = from,
            ToUserId = to,
            Amount = amount,
            Method = method,
            Note = "e2e payment",
        }, auth: true);

    /// <summary>tests/fixtures/receipt-sample.jpg, located by walking up from the test bin.</summary>
    private static byte[] FixtureJpg()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var path = Path.Combine(dir.FullName, "tests", "fixtures", "receipt-sample.jpg");
            if (File.Exists(path)) return File.ReadAllBytes(path);
            dir = dir.Parent;
        }
        throw new FileNotFoundException($"tests/fixtures/receipt-sample.jpg not found above {AppContext.BaseDirectory}");
    }

    // ------------------------------------------------------------------- tests

    [Fact]
    public async Task Payments_Partial_Then_Full_Settle_Locks_The_Group()
    {
        var (ownerId, debtorId, groupId, _) = await OwedSceneAsync(30m);

        // Partial payment: 10 of the 30 the debtor owes.
        var partial = await RecordAsync(groupId, debtorId, ownerId, 10m, "cash");
        var partialPay = partial.GetProperty("payment");
        Assert.Equal(debtorId, partialPay.GetProperty("from_user_id").GetGuid());
        Assert.Equal(ownerId, partialPay.GetProperty("to_user_id").GetGuid());
        Assert.Equal(1000L, partialPay.GetProperty("amount_cents").GetInt64());
        Assert.Equal("OPEN", partialPay.GetProperty("status").GetString());
        Assert.False(partial.GetProperty("fully_settled").GetBoolean());

        // Settle the remaining 20: every net hits zero and the group locks.
        var settle = await RecordAsync(groupId, debtorId, ownerId, 20m, "transfer");
        Assert.True(settle.GetProperty("fully_settled").GetBoolean(),
            "paying the remaining 20 clears every net in the group");
        Assert.Equal("LOCKED", settle.GetProperty("payment").GetProperty("status").GetString());
        Assert.True(settle.GetProperty("settlement_version").GetInt32() >= 1);

        // Ledger: one expense + two payments, all locked now.
        var ledger = await Client.GetOkAsync($"/api/v1/groups/{groupId}/ledger");
        Assert.Equal(3, ledger.GetProperty("total").GetInt32());
        Assert.All(ledger.GetProperty("items").EnumerateArray(),
            item => Assert.Equal("LOCKED", item.GetProperty("status").GetString()));
    }

    [Fact]
    public async Task Payments_Reverse_Restores_The_Debtors_Balance()
    {
        var (ownerId, debtorId, groupId, _) = await OwedSceneAsync(30m);

        var partial = await RecordAsync(groupId, debtorId, ownerId, 10m, "cash");
        var paymentId = E2eClient.Id(partial.GetProperty("payment"), "payment_id");

        // Owner reverses the partial payment (24 h window, nothing locked yet).
        var reversed = await Client.PostOkAsync($"/api/v1/payments/{paymentId}/reverse", auth: true);
        Assert.Equal(paymentId, E2eClient.Id(reversed.GetProperty("payment"), "payment_id"));
        Assert.True(reversed.TryGetProperty("settlement_version", out _),
            "reversal bumps the settlement version like any ledger write");

        // The full 30 is owed again — recording it succeeds only because the
        // reversal restored the balance (a stale balance would reject 30 as OVERPAYMENT).
        var settle = await RecordAsync(groupId, debtorId, ownerId, 30m, "transfer");
        Assert.True(settle.GetProperty("fully_settled").GetBoolean());
    }

    [Fact]
    public async Task Payments_Proof_Upload_Round_Trips_The_Bytes()
    {
        var (ownerId, debtorId, groupId, _) = await OwedSceneAsync(30m);
        var payment = await RecordAsync(groupId, debtorId, ownerId, 10m, "cash");
        var paymentId = E2eClient.Id(payment.GetProperty("payment"), "payment_id");

        var fixture = FixtureJpg();
        var upload = await Client.UploadAsync($"/api/v1/payments/{paymentId}/proof",
            "file", "receipt-sample.jpg", fixture, "image/jpeg");
        var body = await Client.OkAsync(upload);
        Assert.True(body.GetProperty("has_proof").GetBoolean());

        var download = await Client.SendAsync(HttpMethod.Get, $"/api/v1/payments/{paymentId}/proof", auth: true);
        Assert.Equal(HttpStatusCode.OK, download.StatusCode);
        Assert.Equal("image/jpeg", download.Content.Headers.ContentType?.MediaType);
        Assert.Equal(fixture, await download.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public async Task Payment_Handles_CRUD_And_Shared_Group_Visibility()
    {
        await Client.RegisterAsync();
        var ownerId = await E2eScenario.UserIdAsync(Client);

        var member = NewClient();
        await member.RegisterAsync();
        var groupId = await E2eScenario.CreateGroupAsync(Client, member);

        // Create + read back on the account itself.
        var created = await Client.PostOkAsync("/api/v1/me/handles",
            new { Label = "Venmo", Details = "@e2e-owner" }, auth: true);
        var handleId = E2eClient.Id(created, "handle_id");
        Assert.Equal("Venmo", created.GetProperty("label").GetString());
        Assert.Equal("@e2e-owner", created.GetProperty("details").GetString());

        var mine = await Client.GetOkAsync("/api/v1/me/handles");
        Assert.Equal(1, mine.GetArrayLength());
        Assert.Equal(handleId, E2eClient.Id(mine[0], "handle_id"));

        // A member of a shared group can see the owner's handles…
        var theirs = await member.GetOkAsync($"/api/v1/users/{ownerId}/handles");
        Assert.Equal(1, theirs.GetArrayLength());
        Assert.Equal(handleId, E2eClient.Id(theirs[0], "handle_id"));
        Assert.Equal("Venmo", theirs[0].GetProperty("label").GetString());

        // …and the delete is reflected on both sides.
        await Client.DeleteOkAsync($"/api/v1/me/handles/{handleId}");
        Assert.Equal(0, (await Client.GetOkAsync("/api/v1/me/handles")).GetArrayLength());
        Assert.Equal(0, (await member.GetOkAsync($"/api/v1/users/{ownerId}/handles")).GetArrayLength());
    }
}
