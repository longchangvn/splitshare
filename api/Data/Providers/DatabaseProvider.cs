using Microsoft.EntityFrameworkCore;

namespace SplitShare.Api.Data.Providers;

/// <summary>
/// Database provider strategy: one implementation per engine, selected by
/// <c>Database:Provider</c> config. Keeps dialect specifics (options setup,
/// concurrency-conflict detection) out of services so a third provider is
/// one new class + one factory line.
/// </summary>
public interface IDatabaseProvider
{
    /// <summary>Config value, e.g. "postgres" or "sqlServer".</summary>
    string Name { get; }

    /// <summary>Config key for this provider's connection string, e.g. "Database:Postgres".</summary>
    string ConnectionKey { get; }

    /// <summary>True when the engine supports explicit transactions (false for InMemory tests).</summary>
    bool SupportsTransactions { get; }

    void Configure(DbContextOptionsBuilder options, string connectionString);

    /// <summary>True when the failure is a serializable-isolation retry (not a real error).</summary>
    bool IsConcurrencyConflict(DbUpdateException ex);
}

public sealed class PostgresProvider : IDatabaseProvider
{
    public string Name => "postgres";
    public string ConnectionKey => "Database:Postgres";
    public bool SupportsTransactions => true;

    public void Configure(DbContextOptionsBuilder options, string connectionString)
        => options.UseNpgsql(connectionString,
            npg => npg.MigrationsHistoryTable("__EFMigrationsHistory", "splitshare"));

    public bool IsConcurrencyConflict(DbUpdateException ex)
    {
        var msg = ex.InnerException?.Message ?? "";
        return msg.Contains("40001") || msg.Contains("could not serialize");
    }
}

public sealed class SqlServerProvider : IDatabaseProvider
{
    public string Name => "sqlServer";
    public string ConnectionKey => "Database:SqlServer";
    public bool SupportsTransactions => true;

    public void Configure(DbContextOptionsBuilder options, string connectionString)
        => options.UseSqlServer(connectionString,
            sql => sql.MigrationsHistoryTable("__EFMigrationsHistory", "splitshare"));

    public bool IsConcurrencyConflict(DbUpdateException ex)
    {
        // SQL Server deadlock victim (vs Postgres 40001 serialization failure).
        if (ex.InnerException is Microsoft.Data.SqlClient.SqlException sqlEx)
        {
            foreach (Microsoft.Data.SqlClient.SqlError err in sqlEx.Errors)
            {
                if (err.Number == 1205) return true;
            }
        }
        return ex.InnerException?.Message.Contains("deadlock") == true;
    }
}

public static class DatabaseProviderFactory
{
    public static IDatabaseProvider Create(IConfiguration config)
    {
        var raw = config["Database:Provider"]?.Trim();
        if (string.IsNullOrEmpty(raw)) return new PostgresProvider(); // default preserves current behavior
        return raw.ToLowerInvariant() switch
        {
            "postgres" or "postgresql" => new PostgresProvider(),
            "sqlserver" or "sql-server" or "mssql" => new SqlServerProvider(),
            _ => throw new InvalidOperationException(
                $"Unknown Database:Provider '{raw}'. Valid values: postgres, sqlServer.")
        };
    }
}
