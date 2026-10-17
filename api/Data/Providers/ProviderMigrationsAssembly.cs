using System.Reflection;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Internal;

#pragma warning disable EF1001 // MigrationsAssembly is an EF internal-support API; selecting a
                              // migration set per provider has no public extension point.

namespace SplitShare.Api.Data.Providers;

/// <summary>
/// Routes migration discovery to the set authored for the active provider.
/// Migrations live in per-provider folders/namespaces:
/// <c>Migrations/Postgres</c> (<c>SplitShare.Api.Migrations.Postgres</c>) and
/// <c>Migrations/SqlServer</c> (<c>SplitShare.Api.Migrations.SqlServer</c>).
/// A provider-specific set is required because migration DDL resolves omitted
/// column types from the migration's target model (its snapshot) — a
/// Postgres-authored snapshot would emit uuid/text/timestamptz under SQL Server.
/// Both providers register this via <c>ReplaceService</c> in their Configure().
/// </summary>
public sealed class ProviderMigrationsAssembly : MigrationsAssembly
{
    private readonly ICurrentDbContext _currentContext;

    public ProviderMigrationsAssembly(
        ICurrentDbContext currentContext,
        IDbContextOptions options,
        IMigrationsIdGenerator idGenerator,
        IDiagnosticsLogger<DbLoggerCategory.Migrations> diagnostics)
        : base(currentContext, options, idGenerator, diagnostics)
        => _currentContext = currentContext;

    /// <summary>EF provider type name fragment -> migration folder/namespace suffix.</summary>
    private static string? FolderFor(string? providerName) => providerName switch
    {
        null => null,
        var p when p.Contains("Npgsql", StringComparison.OrdinalIgnoreCase) => "Postgres",
        var p when p.Contains("SqlServer", StringComparison.OrdinalIgnoreCase) => "SqlServer",
        _ => null // e.g. InMemory tests: no migration set, no snapshot
    };

    private string? Folder => FolderFor(_currentContext.Context.Database.ProviderName);

    private bool InFolder(Type type)
        => type.Namespace?.EndsWith(".Migrations." + Folder, StringComparison.OrdinalIgnoreCase) == true;

    public override IReadOnlyDictionary<string, TypeInfo> Migrations
    {
        get
        {
            if (Folder is null) return new SortedList<string, TypeInfo>();
            var mine = new SortedList<string, TypeInfo>();
            foreach (var (id, type) in base.Migrations)
                if (InFolder(type)) mine[id] = type;
            return mine;
        }
    }

    public override ModelSnapshot? ModelSnapshot
    {
        get
        {
            if (Folder is null) return null;
            // Same rules as the base lookup (IModelSnapshot + [DbContext(AppDbContext)]),
            // filtered to this provider's folder — the base SingleOrDefault would throw
            // with two snapshots present.
            var contextType = _currentContext.Context.GetType();
            var snapshotType = Assembly.GetTypes().FirstOrDefault(t =>
                t.IsClass && !t.IsAbstract
                && typeof(ModelSnapshot).IsAssignableFrom(t)
                && t.GetCustomAttribute<DbContextAttribute>()?.ContextType == contextType
                && InFolder(t));
            return snapshotType is null ? null : (ModelSnapshot)Activator.CreateInstance(snapshotType)!;
        }
    }
}
