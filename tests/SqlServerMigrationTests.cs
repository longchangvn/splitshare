using System.Reflection;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SplitShare.Api.Data;
using SplitShare.Api.Data.Providers;

#pragma warning disable EF1001 // IMigrationsAssembly is EF internal-support API (set-selection guard)

namespace SplitShare.Tests;

/// <summary>Dual migration-SET guard: each provider authors its own set
/// (api/Migrations/Postgres, api/Migrations/SqlServer) because migration DDL resolves
/// omitted column types from the set's snapshot — a Postgres snapshot would emit
/// uuid/text/timestamptz under SQL Server. ProviderMigrationsAssembly routes each
/// provider to its own set; these tests pin that selection and the SQL Server output.</summary>
public sealed class SqlServerMigrationTests
{
    private static AppDbContext Db(IDatabaseProvider provider)
    {
        var opts = new DbContextOptionsBuilder<AppDbContext>();
        provider.Configure(opts, "Host=x;Database=x;Username=x;Password=x"); // never opened
        return new AppDbContext(opts.Options);
    }

    private static AppDbContext SqlServerDb() => Db(new SqlServerProvider());

    private static IEnumerable<Type> Set(AppDbContext db)
        => db.GetService<IMigrationsAssembly>().Migrations.Values.Select(t => t.AsType());

    [Fact]
    public void Postgres_RuntimeModel_Unchanged()
    {
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql("Host=x;Database=x;Username=x;Password=x").Options);
        var sql = db.Database.GenerateCreateScript();
        Assert.Contains("uuid", sql);
        Assert.Contains("timestamp with time zone", sql);
    }

    [Fact]
    public void Provider_Sees_Only_Its_Own_Set()
    {
        var sqlServer = Set(SqlServerDb()).ToList();
        var postgres = Set(Db(new PostgresProvider())).ToList();
        Assert.NotEmpty(sqlServer);
        Assert.NotEmpty(postgres);
        Assert.All(sqlServer, t => Assert.Equal("SplitShare.Api.Migrations.SqlServer", t.Namespace));
        Assert.All(postgres, t => Assert.Equal("SplitShare.Api.Migrations.Postgres", t.Namespace));
    }

    [Fact]
    public void Every_Migration_Lives_In_A_Provider_Folder()
    {
        // A migration scaffolded without -o Migrations/<provider> lands in the root
        // Migrations namespace and would be silently invisible to both providers.
        var orphans = typeof(AppDbContext).Assembly.GetTypes()
            .Where(t => t is { IsClass: true, IsAbstract: false }
                && typeof(Migration).IsAssignableFrom(t)
                && t.GetCustomAttribute<DbContextAttribute>()?.ContextType == typeof(AppDbContext))
            .Where(t => t.Namespace is not { } ns
                || (!ns.EndsWith(".Migrations.Postgres") && !ns.EndsWith(".Migrations.SqlServer")))
            .ToList();
        Assert.Empty(orphans);
    }

    [Fact]
    public void Snapshots_Have_Distinct_Names_PerProvider()
    {
        // The ef CLI locates snapshot files by file name across the project (first match
        // wins), so each set's snapshot class/file must be uniquely named — the Postgres
        // set keeps the conventional AppDbContextModelSnapshot, SqlServer uses its own.
        var snapshots = typeof(AppDbContext).Assembly.GetTypes()
            .Where(t => t is { IsClass: true, IsAbstract: false }
                && typeof(ModelSnapshot).IsAssignableFrom(t)
                && t.GetCustomAttribute<DbContextAttribute>()?.ContextType == typeof(AppDbContext))
            .ToList();
        Assert.Equal(2, snapshots.Count);
        Assert.Equal(snapshots.Count, snapshots.Select(t => t.Name).Distinct(StringComparer.Ordinal).Count());
    }

    [Fact]
    public void SqlServer_Set_Generates_MsTypes_NoPgIsms()
    {
        var db = SqlServerDb();
        var gen = db.GetService<IMigrationsSqlGenerator>();
        const string SqlServer = "Microsoft.EntityFrameworkCore.SqlServer";
        var sql = "";
        foreach (var type in Set(db))
        {
            var m = (Migration)Activator.CreateInstance(type)!;
            var b = new MigrationBuilder(SqlServer);
            type.GetMethod("Up", BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public)!
                .Invoke(m, [b]);
            sql += string.Join("\n", gen.Generate(b.Operations, db.Model).Select(c => c.CommandText));
        }
        Assert.Contains("CREATE TABLE", sql);
        Assert.Contains("uniqueidentifier", sql);
        Assert.Contains("datetime2", sql);
        Assert.Contains("18,8", sql.Replace(" ", ""));
        Assert.DoesNotContain("uuid", sql);
        Assert.DoesNotContain("timestamp with time zone", sql);
        Assert.DoesNotContain("character varying", sql);
    }
}
