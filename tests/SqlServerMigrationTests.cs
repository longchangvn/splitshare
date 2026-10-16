using System.Reflection;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SplitShare.Api.Data;
namespace SplitShare.Tests;
/// <summary>Dual-provider guard: migrations must stay provider-neutral so the same
/// set applies on Postgres and SQL Server. Replays every migration Up() through the
/// real SqlServer pipeline (generator + runtime model) with no DB connection.
/// NOTE: the ef script tool reads the Npgsql-authored snapshot and may show
/// Postgres type names there — that is a tooling artifact, not what MigrateAsync runs.</summary>
public sealed class SqlServerMigrationTests
{
    private static AppDbContext SqlServerDb() => new(new DbContextOptionsBuilder<AppDbContext>()
        .UseSqlServer("Server=x;Database=x;User Id=sa;Password=x;TrustServerCertificate=True").Options);

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
    public void SqlServer_MigrationOps_Generate_MsTypes()
    {
        var db = SqlServerDb();
        var gen = db.GetService<IMigrationsSqlGenerator>();
        const string SqlServer = "Microsoft.EntityFrameworkCore.SqlServer";
        var sql = "";
        foreach (var m in new Migration[] { new SplitShare.Api.Migrations.Baseline(), new SplitShare.Api.Migrations.TripPack() })
        {
            var b = new MigrationBuilder(SqlServer);
            m.GetType().GetMethod("Up", BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public)!
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
