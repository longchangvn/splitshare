using Microsoft.EntityFrameworkCore;
using SplitShare.Api.Data;
using SplitShare.Api.Models;
using SplitShare.Api.Services;

namespace SplitShare.Tests;

// Ledger nets: net = paid - owed - paid_out + received; sum == 0.
public sealed class LedgerTests
{
    private static AppDbContext InMemory()
        => new(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    [Fact]
    public async Task ComputeNets_MatchesSpecExample()
    {
        using var db = InMemory();
        var a = new User { DisplayName = "A", Username = "a", Email = "a@x.io" };
        var b = new User { DisplayName = "B", Username = "b", Email = "b@x.io" };
        var g = new Group { Name = "Trip", Currency = "USD", CreatedBy = a.Id };
        db.Users.AddRange(a, b);
        db.Groups.Add(g);
        db.GroupMembers.AddRange(
            new GroupMember { GroupId = g.Id, UserId = a.Id, Role = "owner" },
            new GroupMember { GroupId = g.Id, UserId = b.Id });
        // A paid $30 for A,B equally: A paid 3000, each owes 1500.
        var e = new Expense
        {
            GroupId = g.Id, Title = "Dinner", AmountCents = 3000, PayerId = a.Id,
            CreatedBy = a.Id,
            Splits = [new ExpenseSplit { UserId = a.Id, ShareCents = 1500 },
                      new ExpenseSplit { UserId = b.Id, ShareCents = 1500 }]
        };
        db.Expenses.Add(e);
        await db.SaveChangesAsync();

        var svc = new LedgerService(db);
        var snapshot = await svc.ComputeNetsAsync(g.Id);
        Assert.NotNull(snapshot);
        Assert.Equal(1500, snapshot.Nets[a.Id]); // +3000 -1500
        Assert.Equal(-1500, snapshot.Nets[b.Id]); // -1500
        Assert.Equal(0, snapshot.Nets.Values.Sum());
        Assert.Equal(1, snapshot.RawDebts); // B's share only (A==payer excluded)

        // B pays A $15.00 -> all zero.
        db.Payments.Add(new Payment
        {
            GroupId = g.Id, FromUserId = b.Id, ToUserId = a.Id,
            AmountCents = 1500, CreatedBy = b.Id
        });
        await db.SaveChangesAsync();
        snapshot = await svc.ComputeNetsAsync(g.Id);
        Assert.NotNull(snapshot);
        Assert.All(snapshot.Nets.Values, v => Assert.Equal(0, v));
    }
}
