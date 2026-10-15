using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using SplitShare.Api.Data.Providers;

namespace SplitShare.Tests;

public sealed class ProviderTests
{
    private static IConfiguration Cfg(string? provider) => new ConfigurationBuilder()
        .AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Database:Provider"] = provider,
            ["Database:Postgres"] = "Host=x",
            ["Database:SqlServer"] = "Server=x"
        }).Build();

    [Fact]
    public void Factory_Selects_By_Config()
    {
        Assert.IsType<PostgresProvider>(DatabaseProviderFactory.Create(Cfg(null))); // default
        Assert.IsType<PostgresProvider>(DatabaseProviderFactory.Create(Cfg("postgres")));
        Assert.IsType<PostgresProvider>(DatabaseProviderFactory.Create(Cfg("PostgreSQL")));
        var sql = DatabaseProviderFactory.Create(Cfg("sqlServer"));
        Assert.IsType<SqlServerProvider>(sql);
        Assert.Equal("Database:SqlServer", sql.ConnectionKey);
        Assert.Throws<InvalidOperationException>(() => DatabaseProviderFactory.Create(Cfg("oracle")));
    }

    [Fact]
    public void Conflict_Detection_Per_Engine()
    {
        var pg = new PostgresProvider();
        var ms = new SqlServerProvider();
        static DbUpdateException Wrap(string msg)
            => new(msg, new InvalidOperationException(msg));
        Assert.True(pg.IsConcurrencyConflict(Wrap("40001: could not serialize access")));
        Assert.False(pg.IsConcurrencyConflict(Wrap("boom")));
        Assert.False(ms.IsConcurrencyConflict(Wrap("40001: could not serialize access")));
        Assert.True(ms.IsConcurrencyConflict(Wrap("deadlock victim detected")));
    }
}
