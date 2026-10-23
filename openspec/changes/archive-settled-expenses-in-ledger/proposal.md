---
slug: "archive-settled-expenses-in-ledger"
createdAt: "2026-10-23T02:19:50.764Z"
---

## Why

Settled (`LOCKED`) expenses currently render inline in the active ledger on both web and mobile, mixed with live expenses. Once a group settles, its immutable snapshot history clutters the view members actually use to track open balances. Users need the active ledger to show only what still needs attention, while settled history remains fully available as an audit archive.

## What Changes

- **Ledger defaults to active only**: web (`GroupDetail.jsx`) and mobile (`GroupScreen.js`) send `status=OPEN` by default instead of no filter; the OPEN/LOCKED status filter chips are relabeled to Active/Archived (the `LOCKED` chip becomes "Archived").
- **Status vocabulary**: wherever the expense status pill/badge is shown (ledger row pill, expense detail badge, i18n en/vi), `LOCKED` is presented to users as "Archived"; the API value stays `LOCKED`.
- **Scoped search**: the ledger search query applies within the selected status scope — by default it searches active entries only; the Archived view has its own scoped search.
- **Fully-settled empty state**: a fully settled group's active view (now empty) shows a friendly "All settled 🎉 — view archive" empty state instead of a bare empty list.
- **No data-model change**: archive is a presentation of the existing `ExpenseStatus.Locked`; no migrations, no new status values, API `status=OPEN|LOCKED` contract unchanged.
- **Reports/statements/exports unchanged**: statement, report, settlement box, and monetary totals continue to include archived entries ("locked history still counts").

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `splitshare-v1/ledger-views`: ledger default view becomes OPEN-only with LOCKED entries reachable via an Archived status filter; status presentation renames LOCKED → Archived; ledger search is scoped to the selected status; archived entries always included in statement/report/totals; fully-settled groups show a dedicated empty state.

## Impact

- Code: `web/src/pages/GroupDetail.jsx` (default `fStatus`, status options, empty state), `web/src/pages/ExpenseDetail.jsx` (badge label), `mobile/src/screens/GroupScreen.js` (default `fStatus`, filter chips, empty state), `mobile/src/screens/ExpenseDetailScreen.js` (pill label), `web/src/i18n/messages.js` (en+vi keys).
- API: unchanged (clients pass existing `status=OPEN|LOCKED` filter values).
- Specs: delta on `openspec/specs/splitshare-v1/ledger-views.md` after sync.
- Tests: ledger default-filter behavior in `tests/`; no balance/settlement logic affected (`needs_settlement`, `delinquent` derive from nets, not list state).
- Non-goals: schema/status changes, archiving OPEN expenses, group lifecycle (opening/locked/closed) changes, excluding archived from reports, hiding archived payments from SettlementBox, group-level archive/inactivity feature.
