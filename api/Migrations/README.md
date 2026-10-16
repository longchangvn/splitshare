# Migrations — dual-provider rule (Postgres + SQL Server)

One migration set serves both providers. That only works if migration
operations stay **provider-neutral**:

- Never author explicit store types (`type: "uuid"`, `"character varying(N)"`,
  `"timestamp with time zone"`, `"boolean"`, …). Omit `type:` and let each
  provider map the CLR type (Guid → uuid/uniqueidentifier, string+maxLength →
  varchar/nvarchar, DateTime → timestamptz/datetime2, bool → boolean/bit).
- Precision is the exception: keep `precision:`/`scale:` (provider-neutral and
  honored by both — decimal(18,8) for FxRate, decimal(5,2) for Percent).
- Keep `OnModelCreating` free of provider-specific calls. The runtime model is
  built from it, and `MigrateAsync()` resolves column types through the active
  provider — this is what actually runs in production.

## Switching providers

Set `Database__Provider=sqlServer` (or `DB_PROVIDER=sqlServer` in compose)
plus a `Database__SqlServer` connection string
(`Server=HOST,PORT;Database=…;User Id=…;Password=…;TrustServerCertificate=True`).
Startup runs `MigrateAsync()` and creates the `splitshare` schema + tables.
No code or migration change needed — verified by
`tests/SqlServerMigrationTests.cs`, which replays every migration through the
real SqlServer pipeline with no DB connection.

## Tooling caveat

`dotnet ef migrations script` renders column types from the Npgsql-authored
model snapshot, so its SQL Server output may show Postgres type names. That is
a design-time artifact: `MigrateAsync()` in the running app does not use the
snapshot. Trust the test, not the script. If you need a reviewable T-SQL
script, generate it from a SQL Server–scaffolded migration instead.

Scaffold new migrations under Postgres (the default) and keep them neutral
per the rule above; the guard test fails the build if Postgres-only types
creep back in.
