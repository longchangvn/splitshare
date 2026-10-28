---
slug: "guest-split-method"
createdAt: "2026-10-27T00:00:00.000Z"
status: "proposed (not implemented)"
---

## Why

Guest shares today are a **fixed add-on**: each guest has a `$` amount that is added on top of the bill and on top of the covering member's share, regardless of the selected split method (`ExpenseService.ResolveGuests` + `map[coveredBy] += guest`).

Example today — bill 90, EQUAL between Anna and Ben, guest "Kid" $30 covered by Anna makes the bill **120** (Anna 75 / Ben 45), and the user has to work out the guest's amount by hand. Users expect the guest to be **one more person inside the same bill**: EQUAL 90 between Anna, Ben and Kid (covered by Anna) → Anna 60 / Ben 30, total stays 90.

Guests must therefore follow the selected split method (EQUAL / EXACT / PERCENT / SHARES) exactly like members, with the guest's computed share charged to the covering member.

## What Changes

- **Guest is a split line**: a guest takes part in the chosen split method as an extra (non-member) line. Its computed share is folded into `covered_by`'s member split, so ledger / nets / settlement math is unchanged.
  - EQUAL: guest counts as one head.
  - EXACT: guest has an exact amount; `sum(members) + sum(guests) == split total`.
  - PERCENT: guest has a percent; `sum(members) + sum(guests) == 100.00`.
  - SHARES: guest has integer shares (≥ 1, default 1).
- **Bill total no longer grows with guests** for new/edited expenses: `amount_cents = amount + tax + tip + fee`. Tax/tip/fee are split across members *and* guests by the same method.
- **API contract (additive)**: guest DTO gains `percent?` and `shares?`; `amount_cents` becomes the EXACT value (required only for EXACT). Preview responses add `guest_shares` so the UI can show each guest's computed amount. Expense detail `guests[]` adds `exact_cents`, `percent`, `shares`, `mode`.
- **Legacy expenses keep their numbers**: existing guest rows are marked `mode = "addon"` and keep the old add-on math until the expense is edited with new guest input.
- **Web form**: guest rows show the same per-method input as member rows (none for EQUAL, `$` for EXACT, `%` for PERCENT, shares for SHARES); running totals and PERCENT equal-prefill include guests.
- **Mobile (RN)**: still does not create guests (out of scope, unchanged), but must show guest lines read-only and must not break edits of expenses that have guests.

## Capabilities

### Modified Capabilities
- `trip-pack/expense-richness` → "Guest shares" requirement replaced (see `specs/trip-pack/expense-richness.md`).

## Impact (summary — full matrix in design.md)

- API: `ExpenseService` (create / preview / update / preview-edit / map), `SplitService` (reused, small helper), `ExpenseEndpoints` DTOs, `ExpenseGuest` model + EF config + **2 migrations (Postgres + SQL Server)**.
- Web: `Forms.jsx` (ExpenseForm guest rows, totals, build, preview), `ExpenseDetail.jsx`, `i18n/messages.js` (en + vi).
- Mobile: `ExpenseDetailScreen.js` (read-only guest lines + edit guard).
- Tests: `tests/TripPackTests.cs`, `tests/SplitTests.cs`, `tests/ContractTests.cs`, new `web/test/guest-split.test.mjs`.
- Non-goals: guests as real users/accounts, guests paying, guests in recurring rules or batch receipt scan, guests on mobile create.
