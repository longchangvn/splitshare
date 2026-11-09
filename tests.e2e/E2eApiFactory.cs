using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Npgsql;
using SplitShare.Api.Auth;
using SplitShare.Api.Expenses;

namespace SplitShare.E2E;

/// <summary>
/// Shared in-process API host for the E2E suite: boots <c>Program.cs</c> exactly as
/// production does (full middleware pipeline, JWT auth, rate limiting, real Postgres
/// migrations on start) and swaps only the two external side effects tests must
/// observe — email (captured) and OCR (deterministic fake).
/// </summary>
/// <remarks>
/// One host per test run (xUnit collection fixture, see <see cref="E2eCollection"/>).
/// The target database is dropped and recreated once, so every run starts from an
/// empty, fully migrated schema. Configuration knobs:
/// <list type="bullet">
/// <item><c>E2E_DB</c> — database name (default <c>splitshare_e2e</c>);</item>
/// <item><c>E2E_ADMIN_CONN</c> — admin connection (defaults to the shell's
/// <c>Database__Postgres</c> pointed at db <c>postgres</c>, else localhost module_platform),
/// used only to CREATE/DROP the test database.</item>
/// </list>
/// </remarks>
public sealed class E2eApiFactory : WebApplicationFactory<Program>
{
    public const string DefaultDatabase = "splitshare_e2e";

    /// <dev>Fixed signing key (≥32 chars) so tokens are stable across runs.</dev>
    private const string JwtKey = "splitshare-e2e-signing-key-0123456789abcdef0123456789abcdef";

    private static readonly string AdminConn = BuildAdminConnectionString();

    /// <summary>Connection string of the E2E database (what the API under test uses).</summary>
    public static string ConnectionString { get; } =
        new NpgsqlConnectionStringBuilder(AdminConn) { Database = DatabaseName }.ConnectionString;

    public static string DatabaseName { get; } = BuildDatabaseName();

    /// <summary>Captures every outbound email (OTP codes, invites, resets, links).</summary>
    public CapturingEmailSender Emails { get; } = new();

    /// <summary>Deterministic OCR provider — one fixed receipt per scan.</summary>
    public FakeOcrService Ocr { get; } = new();

    public E2eApiFactory() => EnsureEmptyDatabase();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.ConfigureAppConfiguration((_, cfg) => cfg.AddInMemoryCollection(
            new Dictionary<string, string?>
            {
                ["Database__Provider"] = "postgres",
                ["Database__Postgres"] = ConnectionString,
                ["Jwt__Key"] = JwtKey,
                // Belt and braces: the sender below replaces the provider entirely;
                // these keep any un-replaced path log-only.
                ["Email__Provider"] = "",
                ["Notification__Provider"] = "",   // push fan-out off (best-effort anyway)
                ["Uploads__Path"] = Path.Combine(Path.GetTempPath(), "splitshare-e2e-uploads"),
                ["App__BaseUrl"] = "http://localhost:3000",
                // Every test shares one rate-limit partition on localhost; raise the
                // auth cap instead of 429ing (prod default stays 5/min).
                ["RateLimit__AuthIp__PermitLimit"] = "1000",
            }));

        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<IEmailSender>();
            services.AddSingleton<IEmailSender>(Emails);
            services.RemoveAll<IOcrService>();
            services.AddSingleton<IOcrService>(Ocr);
        });
    }

    /// <summary>Recreates the test database so each run starts from a clean schema.</summary>
    private static void EnsureEmptyDatabase()
    {
        var admin = new NpgsqlConnectionStringBuilder(AdminConn) { Database = "postgres" };
        using var conn = new NpgsqlConnection(admin.ConnectionString);
        conn.Open();
        using (var kill = new NpgsqlCommand(
                   "SELECT pg_terminate_backend(pid) FROM pg_stat_activity " +
                   "WHERE datname = @db AND pid <> pg_backend_pid();", conn))
        {
            kill.Parameters.AddWithValue("db", DatabaseName);
            kill.ExecuteNonQuery();
        }
        using (var drop = new NpgsqlCommand($"DROP DATABASE IF EXISTS \"{DatabaseName}\"", conn))
            drop.ExecuteNonQuery();
        using (var create = new NpgsqlCommand($"CREATE DATABASE \"{DatabaseName}\"", conn))
            create.ExecuteNonQuery();
    }

    private static string BuildDatabaseName()
    {
        var name = Environment.GetEnvironmentVariable("E2E_DB");
        if (string.IsNullOrWhiteSpace(name)) name = DefaultDatabase;
        // Identifier safety: the name is interpolated into DDL above.
        if (!System.Text.RegularExpressions.Regex.IsMatch(name, "^[a-zA-Z_][a-zA-Z0-9_]*$"))
            throw new InvalidOperationException($"E2E_DB '{name}' is not a valid database name.");
        return name;
    }

    private static string BuildAdminConnectionString()
    {
        var explicitConn = Environment.GetEnvironmentVariable("E2E_ADMIN_CONN");
        if (!string.IsNullOrWhiteSpace(explicitConn)) return explicitConn;

        // Reuse whatever connection the shell provides (.env.e2e) and just aim it at
        // the maintenance database — no credentials duplicated here.
        var fromShell = Environment.GetEnvironmentVariable("Database__Postgres");
        if (!string.IsNullOrWhiteSpace(fromShell))
            return new NpgsqlConnectionStringBuilder(fromShell) { Database = "postgres" }.ConnectionString;

        return "Host=localhost;Port=5432;Username=module_platform;Password=module_platform";
    }
}
