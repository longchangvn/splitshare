## 1. Provider strategy + config

- [x] 1.1 `IDatabaseProvider` + Postgres/SqlServer implementations + factory on `Database:Provider` (fail fast otherwise)
- [x] 1.2 `Program.cs` wiring: provider-selected options, legacy connection fallback, SqlServer package reference
- [x] 1.3 Move serializable-guard + conflict detection from `IsNpgsql()` branch into provider abstraction

## 2. Squashed baseline migration

- [x] 2.1 Delete 3 Npgsql migrations + snapshot, add single baseline, eyeball for provider annotations
- [x] 2.2 Fresh Postgres `database update` green + existing 40 tests green
- [x] 2.3 Offline SQL Server `migrations script` generation green (dummy connection string)

## 3. Inline split inputs

- [x] 3.1 Per-participant boxes keyed by user id (prefill on switch, stash on uncheck, drop `detail` string)
- [x] 3.2 Live running totals + edit-mode prefill from stored splits
- [x] 3.3 Web build green

## 4. Client copy expense

- [x] 4.1 Copy button on detail → create form prefilled via route state (title, payer, participants ∩ active, values, dropped notice)
- [x] 4.2 Receipt carry-over: download source blobs, re-upload on save with per-image errors
- [x] 4.3 Web build green + happy-path smoke against live API

## Verification Notes
- 42/42 xunit pass (incl factory selection + per-engine conflict detection); squashed Baseline applied fresh to Postgres (16 tables); SQL Server offline script clean T-SQL with numeric(5,2), no pg-isms; HasPrecision(5,2) fixed silent-truncation warning
- web build green; live: percent persisted+returned in detail, survives title-only edit; copy flow uses verified create/detail/upload endpoints; provider fail-fast on oracle, sqlServer boots degraded (health ok, db-ping 503 envelope)
