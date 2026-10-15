## Context

API is Npgsql-only (`Program.cs` hardcodes `UseNpgsql`; migrations carry Npgsql annotations; `PaymentService` branches on `IsNpgsql()`). Expense form uses one `id:val` textbox (`Forms.jsx`). No copy affordance exists. SQL Server will be external (no compose change).

## Goals / Non-Goals

**Goals:**
- Config-only provider switch; third provider = one new class.
- Postgres behavior byte-for-byte identical after re-baselining.
- Split inputs prefilled with live totals; copy via existing endpoints only.

**Non-Goals:**
- SQL Server container in compose; live SQL Server apply here (external server).
- Cross-provider penny-identical splits (ordering differs by provider type sort; deterministic within each).
- Server-side copy endpoint.

## Decisions

1. **`IDatabaseProvider` strategy** (`Data/Providers/`): `Name`, `ConfigureOptions(DbContextOptionsBuilder, conn)` (provider + `splitshare`-schema history), `IsConcurrencyConflict(DbUpdateException)` (pg `40001` vs mssql `1205`), selected by factory from `Database:Provider`. `PaymentService` takes the provider instead of `IsNpgsql()`. Rationale: single extension point; alternatives (if/else at each site) rot with provider #3.
2. **Squash to one baseline**: delete the 3 migrations + snapshot, `migrations add Baseline` per provider config? EF emits one code set — since keys are client GUIDs and columns are primitives, the generated operations are provider-agnostic; history-table schema config already parameterized. If the generator emits an annotation for one provider, isolate it in `OnModelCreating` behind `Database.IsXxx()` (model-level, runs on both). Verify: fresh Postgres `database update` + `migrations script` for SqlServer with a dummy connection string.
3. **Dev Postgres data**: re-baselining orphans the existing `__EFMigrationsHistory` rows — dev DBs reset (or manually stamp the baseline id). Documented in README, not automated.
4. **Split inputs as `Record<userId, string>`** keyed state (not the `detail` string): survives type switches and uncheck/restore; `build()` derives exact/percent/shares arrays from checked entries only. Running totals computed locally (no extra calls); server 422 remains the authority.
5. **Copy as route state, not endpoint**: detail page navigates to create form with `location.state.copyFrom` (full detail payload); form initializes title/payer/participants/values from it; images: on save, fetch source blobs via authed GET and POST as multipart to the new expense, collecting per-image errors. Rationale: zero backend change, works from locked groups.
6. **Config shape**: `Database:Provider` + `Database:Postgres` + `Database:SqlServer`; keep legacy `ConnectionStrings:module-platform/Default` as final fallback (standalone/back-compat), Aspire env override still wins.

## Risks / Trade-offs

- Squashed migration must be eyeballed for `Annotation("Npgsql:…")` / `Annotation("SqlServer:…")` leakage; any leak goes behind provider-conditional model config.
- `decimal Percent` precision and `DateTime` kind behave per provider; covered by existing tests on Postgres, needs a live SQL Server pass by the user.
- Copy image re-upload doubles bandwidth for big receipts; acceptable (≤5 × 10MB) with per-image error isolation.
