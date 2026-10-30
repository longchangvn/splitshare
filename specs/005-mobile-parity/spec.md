# Spec 005 — Mobile parity with the stable web app

Status: **approved 2026-10-25** — decisions recorded in §9 (D1, D2 approved; D3, D4 resolved).

## 1. Goal

The web app is the product of record. The Expo app (`mobile/`) covers V1 frames 1–8
only and has drifted. Make every user-facing web capability reachable and behave the
same on iOS/Android, with a mobile-native information architecture that reaches the
common jobs in as few taps as possible.

Two jobs, in order:

1. **Fix divergence** for features the mobile app already has (behaviour must match web).
2. **Mirror** features the mobile app does not have (no redesign, same data and rules).

## 2. Sources of truth

| Layer | Path |
|---|---|
| Web UI (19 route entries → 17 pages, 25 source files, ~11.6k LOC) | `web/src/` |
| Mobile app (8 screens, 15 files, ~4.4k LOC) | `mobile/` |
| API (all endpoints) | `api/Endpoints/`, `api/Services/` |
| Web unit tests (11 suites) | `web/test/` |
| API tests | `tests/` |
| Mobile mapping check | `mobile/scripts/mapping-check.js` |
| Mobile design reference | `docs/mobile-design.html`, `docs/mobile-actions-redesign.html` |

## 3. Parity rules

R1. **Data and rules are identical.** Same endpoints, same payloads, same server
    invariants (per-currency nets never summed, idempotency keys on money POSTs,
    `expected_version` on edit, un-settle preview before save, owner/treasurer
    permissions, `OPEN`/`LOCKED` lifecycle, error codes).

R2. **Behaviour parity, not pixel parity.** Screen layout may be reorganised for
    phones; every state the web shows must exist (loading, empty, error,
    partial-failure) and every action must have the same effect and the same
    confirmation rules.

R3. **No silent capability loss.** Where the web exposes a destructive or
    irreversible action (delete group, remove member, leave, delete account,
    reverse payment, close group), mobile shows the same consequence text and a
    confirm step.

R4. **Mobile may be a superset, never a contradiction.** Keep mobile-only
    affordances that do not conflict with web rules (biometric unlock, group
    currency picker, offline draft queue, per-group push mute). No web capability
    may be removed in their favour.

R5. **Approval gate for new API.** Any new/changed endpoint is listed in §9 and
    must be approved before implementation. Preferred order: reuse existing API →
    adapt client → add endpoint.

R6. **Mobile UX budget.** Bottom tab bar stays at 5 destinations. Any group-level
    capability is at most 3 taps from the group screen (primary actions: 1 tap).
    Tap targets ≥ 44 pt, no horizontal scrolling of primary content, no desktop
    tables.

## 4. Current state (measured, not assumed)

- Web routes: `/`, `/groups`, `/activity`, `/groups/:id`, `/groups/:id/expenses/:eid`,
  `/groups/:id/statement`, `/groups/:id/report`, `/groups/:id/invite`, `/profile`,
  `/settings`, `/login`, `/register`, `/forgot`, `/reset/:token`, `/verify/:token`,
  `/g/:token`, `/s/:token`.
- Web references **54 distinct `/api/v1/...` path strings** (grep-normalised;
  includes the `auth/` prefix check). Mobile references **32**. Mobile never calls
  statements, recurring rules, categories, summary, breakdown, nudges, comments,
  group rename/lifecycle, payment handles, invite preview, public share page,
  capabilities or CSV export. (It does call per-group activity and settlement
  history, but only from the Activity tab and settlement screen.)
- Mobile divergences that break web behaviour today:
  - Home hero sums `owe_cents` across currencies when no `USD` row exists
    (`HomeScreen.totalOwe`) — violates the "never summed" invariant.
  - Money renders `USD 12.00`, web renders `$12.00` with grouping.
  - Add expense defaults payer to the first member; web defaults to *me*.
  - No client amount validation (`> 0`, ≤ 1,000,000, 2 dp) → avoidable 422s.
  - Reset password does not log in with the returned token pair (web does).
  - "Copy" invite link opens the share sheet; nothing is copied.
  - Settlement "reverse" exists only behind an unused `paymentId` param.
  - Group "Photos" tab is a placeholder with no web counterpart.
  - Push permission is requested and an Expo token is obtained but never
    registered anywhere, so no push can arrive.

## 5. Scope — feature groups (details in `parity-matrix.md`)

1. Account & session: login, register, Google, forgot, reset, verify email, logout,
   refresh, biometric (keep).
2. Home: netted balance, per-group breakdown + transfers, settled gauge,
   recent activity, needs-attention groups.
3. Groups list: lifecycle filters, rich tiles (settled chip, my net, members,
   total spend, owner, 30d), empty states.
4. Quick add: people/group picker → expense, create-group-then-expense,
   create-group-with-people.
5. New group: 2-step wizard, templates, top contacts, invites, success screen,
   from-template path.
6. Group: hero, rename, lifecycle change, budget, invite hub, ledger filters +
   totals + row actions, balances (nudge/pay), statement, people (roles, deposits,
   removal), activity (reverse), recurring, categories, report (metrics, charts,
   per-person, category breakdown), leave/delete.
7. Expense: full create/edit form (category, date, tax/tip/fee, FX, guests,
   only-present, receipts, un-settle guard, save & new, copy), detail (summary,
   receipts preview, audit, comments), single + batch receipt scan.
8. Payments/settlement: payment form with handles and validation, settlement
   Why-box parity, completed transfers with reverse.
9. Activity tab: aggregated feed with paging and group filter.
10. Profile/settings: payment handles, language preference (EN/VI), templates,
    offline queue, push, logout confirm.
11. Public/deep links: `/g/:token` landing, `/s/:token` read-only share,
    `/reset/:token`, `/verify/:token`, `/groups/:id/expenses/:eid`,
    `/groups/:id/statement`, `/groups/:id/report`.

## 6. Out of scope (verified unused by the web UI)

- `PATCH /groups/{id}/settings` (budget/mode/flat fee setters) and
  `POST /groups/{id}/flat-fee` — no web UI; budget is display-only today.
- `POST /expenses/ocr` (legacy single-receipt OCR) — superseded by
  `POST /groups/{id}/expenses/scan`, unused by web.
- Payment proof upload/view (`POST/GET /payments/{id}/proof`) — unused by web.
- Web print-stylesheet fidelity, desktop-only layouts, sidebar, keyboard shortcuts.
- Any change to web behaviour or API semantics beyond the additive endpoints in §9.

## 7. User stories

- **US-1** As a member with money open, I open the app and see what I owe in the
  currency it is owed in, tap the amount, and see which group and which person to
  pay — then pay in one more tap.
- **US-2** As the person who pays for the trip, I scan ten receipts in one go,
  correct the amounts, and create ten expenses without retyping anything.
- **US-3** As a group owner, I can rename the group, close it when settled, invite
  people by email/contact/link, manage categories and recurring bills, and read a
  shared report of who paid what.
- **US-4** As any member, I can read the settlement explanation, see who paid whom,
  nudge a debtor, reverse a wrong payment, and read my own statement.
- **US-5** As an existing user, everything I can do on the website today is
  available in the app, with identical amounts, statuses and error messages.

## 8. Acceptance criteria

- AC-1 Every row in `parity-matrix.md` marked **mirror**, **align** or **fix** has
  a corresponding implementation task in `tasks.md` and is demonstrably working.
- AC-2 Amounts, statuses and permissions match web for the same data set
  (spot-check with the seeded fixtures in `tests/fixtures/`).
- AC-3 The per-currency invariant holds everywhere: no cross-currency sum is ever
  displayed or sent.
- AC-4 Money writes are idempotent and offline-safe: expense/payment reuse the
  same `Idempotency-Key` on retry; edits send `expected_version`.
- AC-5 Destructive actions require a confirm step with the same consequence text
  as web; blocked operations surface the server code (`HAS_OPEN_BALANCE`,
  `OVERPAYMENT`, `EXPENSE_LOCKED`, `STALE_VERSION`, `GROUP_READ_ONLY`).
- AC-6 Common jobs meet the tap budget: pay a suggested transfer ≤ 3 taps from
  app open; add expense in a group ≤ 2 taps; scan receipts ≤ 3 taps.
- AC-7 Loading, empty and error states exist for every list and form; no blank
  screen on network failure.
- AC-8 `npm --prefix mobile test`, `node --test web/test/*.mjs`,
  `npm --prefix web build` and `dotnet test tests/SplitShare.Tests.csproj` pass
  (the last one only after task 0.0 repairs the pre-existing test build).
- AC-9 No regression in existing mobile-only features (biometric, offline queue,
  deep-link join, 44 pt targets).
- AC-10 Accessibility: every icon-only control has an `accessibilityLabel`;
  dynamic type does not clip primary actions.

## 9. Decisions (resolved 2026-10-25)

| # | Decision | Outcome | Consequence |
|---|---|---|---|
| D1 | `GET /me/activity` aggregated feed | **APPROVED** | One request per page for Home + Activity; mobile falls back to per-group fan-out when the capability flag is absent |
| D2 | `POST/DELETE/PATCH /me/devices` + Expo push provider | **APPROVED** | Mobile push becomes real (token registered, muted groups skipped, delete on logout) |
| D3 | Report export on mobile | **DECLINED — no export** | No PDF, no CSV action. Report is in-app only; recorded as accepted gap G-1 |
| D4 | Theme and language parity | **EN/VI only** | Full i18n catalogue and language switch; **fixed light palette** (no dark theme). Accepted gap G-2 |
| D5 | Group screen IA | **2 segments + sheet** | Visible: Expenses · Balances. Sheet: Activity, Statement, Report, People, Recurring, Categories, Invite, Settings |

### Accepted gaps (explicit, not oversights)

- **G-1** No report export/share file on mobile (web prints a PDF). In-app report
  covers the same numbers; `GET /groups/{id}/export.csv` stays unused on mobile.
- **G-2** No dark theme on mobile (web has light/dark). The mobile palette stays
  the existing light theme; language switching is still required.
- **G-3** No web-style tab rail; group capabilities live in the `⋯` sheet (D5).

If D1/D2 later become unavailable, mobile degrades gracefully (per-group fan-out,
local-only push UI) without a spec change.

## 10. Assumptions

- A-1 Web behaviour at branch `stage` (including the uncommitted receipt-scan
  changes) is the reference.
- A-2 The API keeps snake_case and the `{code, message, fields?}` error envelope.
- A-3 Group budget has no setter UI on web, so mobile mirrors it read-only.
- A-4 V1 "trip-pack excluded" note in `mobile/README.md` is obsolete for this
  feature; it is superseded by this spec.
- A-5 No new chart, state-management, or form library; charts become mobile-native
  bars/donuts drawn with `View`s (no `react-native-svg`).
- A-6 New mobile capabilities are released as one app build; API additions are
  deployable first (additive, backward compatible).
- A-7 Per D3/D4: the app ships light-only and without file export; those are
  accepted gaps, not partial implementations to "finish later" unless requested.
- A-8 The API test project is currently unbuildable at HEAD (`tests/OcrTests.cs`
  references removed receipt-parser types). Repairing it is a prerequisite for
  verifying D1/D2, not part of the mobile feature itself.

## 11. Edge cases to cover

Currency mismatch, reversed payments, locked/archived rows, removed members in
history, closed groups (read-only), offline drafts containing now-invalid members,
duplicate receipt photos, >10 receipts, 429 OCR rate limit, 501 OCR disabled,
expired invite token (410), unverified Google email, expired refresh token,
deleted group while open in the app, guest shares summing over the total, FX rate
missing, zero-share participants, single-member groups.
