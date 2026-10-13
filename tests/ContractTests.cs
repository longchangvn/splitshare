using System.Text.Json;
using SplitShare.Api.Common;
using SplitShare.Api.Endpoints;

namespace SplitShare.Tests;

// API contract: snake_case both directions (spec §9).
public sealed class ContractTests
{
    private static readonly JsonSerializerOptions Opts = new()
    {
        PropertyNamingPolicy = new SnakeCaseNamingPolicy()
    };

    [Fact]
    public void Snake_Request_Binds_And_Response_IsSnake()
    {
        var dto = JsonSerializer.Deserialize<ExpenseEndpoints.CreateExpenseDto>(
            """{"title":"T","amount":10.5,"payer_id":"00000000-0000-0000-0000-000000000000","split_type":"EQUAL","participant_ids":[]}""",
            Opts);
        Assert.NotNull(dto);
        Assert.Equal("EQUAL", dto!.SplitType);
        Assert.Equal(10.5m, dto.Amount);

        var json = JsonSerializer.Serialize(
            new { ExpenseId = Guid.Empty, UnsettledUserIds = new List<Guid>(), SettlementVersion = 3 }, Opts);
        Assert.Contains("expense_id", json);
        Assert.Contains("unsettled_user_ids", json);
        Assert.Contains("settlement_version", json);
    }

    [Fact]
    public void Policy_Conversions()
    {
        var p = new SnakeCaseNamingPolicy();
        Assert.Equal("payer_id", p.ConvertName("PayerId"));
        Assert.Equal("already_member", p.ConvertName("AlreadyMember"));
        Assert.Equal("code", p.ConvertName("Code"));
    }
}
