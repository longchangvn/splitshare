# Migrations — one set per provider (Postgres + SQL Server)

Each provider authors its **own migration set**, in its own folder/namespace:

| Provider | Folder | Namespace | Snapshot (distinct class name!) |
|---|---|---|---|
| `postgres` | `api/Migrations/Postgres` | `SplitShare.Api.Migrations.Postgres` | `AppDbContextModelSnapshot` |
| `sqlServer` | `api/Migrations/SqlServer` | `SplitShare.Api.Migrations.SqlServer` | `SqlServerAppDbContextModelSnapshot` |

`Data/Providers/ProviderMigrationsAssembly` (registered by both providers via
`ReplaceService`) filters migration discovery and the snapshot lookup to the
active provider's namespace, so `MigrateAsync()`, `GetMigrations()` and the
`__EFMigrationsHistory` table only ever see that provider's set. Each database
engine gets the DDL authored for it — no cross-provider type leakage.

## Why not one shared set?

Migration DDL resolves **omitted** column types from the migration's *target
model* (its snapshot), not from the runtime model. A single snapshot stores one
provider's store types (`uuid`, `character varying(30)`, `timestamp with time
zone`), so applying it on the other engine emits invalid SQL (verified live:
SQL Server Error 156 on `timestamp with time zone`). `tests/SqlServerMigrationTests.cs`
pins the selection and the SQL Server output.

## Adding a migration

Scaffold **per provider you are changing** — the provider config selects the set:

```bash
# Postgres set (default)
dotnet ef migrations add <Name> --project api -o Migrations/Postgres

# SQL Server set
Database__Provider=sqlServer dotnet ef migrations add <Name> --project api -o Migrations/SqlServer
```

Rules that keep the sets healthy (the guard tests fail the build otherwise):

- Always pass `-o Migrations/<Provider>`; a migration scaffolded into the root
  `Migrations` folder is invisible to both providers.
- Never rename a set's snapshot class: the ef CLI reuses the existing class
  name, and locates snapshot files **by file name across the project** (first
  match wins) — that is why the two snapshots have distinct names.
- Keep ops free of hand-written store types (`type:`) and provider annotations;
  let the provider map CLR types (Guid → uuid/uniqueidentifier, DateTime →
  timestamptz/datetime2, string+maxLength → varchar/nvarchar). Precision is the
  exception: keep `precision:`/`scale:` (decimal(18,8) FxRate, decimal(5,2) Percent).
- Keep `OnModelCreating` free of provider-specific calls — the runtime model is
  built from it on both engines.

## Applying

Startup runs `MigrateAsync()` for the configured provider
(`Database__Provider` + `Database:Postgres`/`Database:SqlServer`), creating the
`splitshare` schema + history table as needed. No code change to switch engines.
