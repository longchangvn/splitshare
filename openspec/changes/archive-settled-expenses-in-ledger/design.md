## Context

Settled expenses are represented by `ExpenseStatus.Locked`, set automatically when all member nets reach zero (`api/Payments/PaymentService.cs` `TryLockAsync`). Locked rows are immutable (403 `EXPENSE_LOCKED`) and never revert to `OPEN`, so lock state is already a stable, one-way archive marker. Both clients fetch the ledger with an optional `status` query param (`LedgerEndpoints.cs`: `OPEN|LOCKED`, no default = both) and currently default to no filter, mixing settled history into the active list. The group lifecycle status (`opening|locked|closed`, `api/Models/Entities.cs`) is a separate concept whose "locked" wording collides with the expense status — renaming the user-facing expense label to "Archived" reduces that collision.

## Goals / Non-Goals

**Goals:**
- Active ledger shows only `OPEN` entries by default (web + mobile parity)
- User-facing label for `LOCKED` expense status becomes "Archived" (chips, row pills, detail badge; en + vi)
- Ledger search scoped to the selected status; default search hits active only
- Friendly empty state when a fully settled group's active view is empty
- Zero API/schema change; reports/statements/totals untouched

**Non-Goals:**
- Archiving `OPEN` expenses (manual/archive-without-settle) — would require a new status and balance-query changes
- Excluding archived entries from search-of-records, statement, report, or exports
- Group-level archive/inactivity lifecycle (delinquent >30d flag stays as-is; no `lastActivity`/archived-group model)
- Renaming the API value `LOCKED` or changing `LedgerEndpoints` validation
- Hiding archived payments in SettlementBox (already tagged "Settled" — out of scope)

## Decisions

**Archive = presentation of `LOCKED` (no new status).**
Rationale: lock is automatic, one-way, and already immutable — exactly the archive invariant. Alternative (new `ARCHIVED` status/`archived_at` column) rejected: requires migrations, touches balance queries and lock logic, and enables archiving of unsettled groups which was explicitly rejected.

**Default filter = `OPEN` rather than a client-side hide.**
Clients send `status=OPEN` by default (server-side filtering, pagination stays correct). Alternative (fetch all, hide LOCKED client-side) rejected: breaks pagination counts and wastes bandwidth.

**Rename via i18n keys, not code branches.**
Chip options and status labels come from existing i18n keys (`groupDetail.statusLocked` etc.); change display strings en+vi to "Archived"/"Đã lưu trữ" while code keeps using `LOCKED` values. Keeps web/mobile/expense-detail consistent from one source.

**Chips: keep two scopes, relabel — not a new tab.**
Per decision: default filter + renamed chips. Web status options and mobile chips `['', 'OPEN', 'LOCKED']` become `['OPEN', 'LOCKED']` labeled Active/Archived (mobile `''` "All" chip removed or kept as tertiary — implement as Active/Archived only to keep the default deterministic).

**Search scoping is a consequence of the default filter.**
`q` is already sent with `status`; once `status=OPEN` is always sent, search is naturally active-only, and the Archived view searches archive rows. No new API behavior.

**Empty state copy reuses existing settlement strings.**
"All settled" copy exists (`SettlementScreen`, `settlement.statusSettled`); the web empty state adds a button that selects the Archived scope.

## Risks / Trade-offs

- **Deep links / saved filters**: any bookmark of the ledger without `status` will now open the active view; archived history requires one extra click. Acceptable — history is intentionally demoted.
- **Mobile chip removal (`''` All)**: users who used "All" lose that combined view. Mitigation: keep an optional "All" chip if trivial, or accept removal since combined view was the problem being solved.
- **i18n drift**: en/vi both must change; missing vi key falls back to en. Verify both.
- **"Locked" vs group lifecycle "locked"**: label rename reduces confusion on expense pills, but group lifecycle badges keep `locked` — ensure group badge copy is not accidentally renamed (only expense-status keys change).
- **Tests asserting default no-filter**: existing tests/clients fetching ledger without `status` still pass (API unchanged) — only UI defaults change; web tests, if any, may assert the old default.
- **Payment rows in ledger**: payments also lock; Archived scope includes them — consistent, but verify the payment display doesn't rely on the removed "All" default.
