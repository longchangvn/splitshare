---
slug: "dual-db-provider-expense-ux"
createdAt: "2026-10-14T20:35:06.000Z"
---

## Why

Deployments need a choice of database (Postgres today, SQL Server for enterprise infra) without code changes, and the expense form's `id:val` free-text split box is error-prone — users asked for inline per-participant inputs plus a copy-expense shortcut for recurring costs.

## What Changes

- API: `Database:Provider` (`postgres` | `sqlServer`) selects an `IDatabaseProvider` strategy at startup; existing Npgsql migrations squash into one provider-clean baseline that applies to both; SQL Server points at an external server (no compose change).
- Web: expense add/edit shows an inline textbox per checked participant for EXACT/PERCENT/SHARES (with prefill + live totals), replacing the `id:val` box; expense detail gains a Copy button that opens the create form prefilled (fields + split values + receipt blobs re-uploaded on save).

## Capabilities

### New Capabilities
- `db-provider`: provider strategy abstraction, config switch, squashed baseline migration

### Modified Capabilities
- `splitshare-v1/expenses`: split detail input contract unchanged on the wire; UI input mode changes (no API change)
- `splitshare-v1/ledger-views`: copy is client-side prefill + existing create/image endpoints (no API change)

## Impact

- Code: `api/` (new `Data/Providers/*`, `Program.cs` wiring, one squashed migration replacing 3), `web/src/components/Forms.jsx` + expense detail page.
- Systems: Postgres path must keep working byte-for-byte (migrations re-baselined); SQL Server verified via offline script generation here, live apply on the external server.
- Out of scope: SQL Server container in compose, mobile apps, server-side copy endpoint.
