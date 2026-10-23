## 1. Web ledger defaults to active (web/src/pages/GroupDetail.jsx)

- [x] 1.1 Change default `fStatus` from `''` to `'OPEN'` (state init + reset paths after group switch/filter clear)
- [x] 1.2 Relabel status filter options: `OPEN` → "Active", `LOCKED` → "Archived" via i18n keys (desktop select + mobile filter drawer, ~lines 889-895 / 960-967)
- [x] 1.3 Add fully-settled empty state to the ledger tab: "All settled" copy + action button that switches `fStatus` to `LOCKED` (web/src/i18n/messages.js en+vi keys)
- [x] 1.4 Verify ledger search `q` still composes with `status=OPEN` by default (no code change expected — confirm request payload)

## 2. Web status labels

- [x] 2.1 Expense detail badge (web/src/pages/ExpenseDetail.jsx): show "Archived" for `status === 'LOCKED'` through i18n instead of raw `x.status`
- [x] 2.2 Confirm row pill `.ledger-status.is-locked` label reads "Archived" from i18n (GroupDetail desktop table + mobile cards)
- [x] 2.3 Do NOT touch group lifecycle badge copy (`groupStatus.locked`) — only expense-status keys change

## 3. Mobile ledger parity (mobile/src/screens/)

- [x] 3.1 Change default `fStatus` from `''` to `'OPEN'` in GroupScreen.js (state init ~line 48)
- [x] 3.2 Replace filter chips `['', 'OPEN', 'LOCKED']` with `['OPEN', 'LOCKED']` labeled Active/Archived (labels via i18n or existing strings)
- [x] 3.3 Locked-row copy "Settled · snapshot" → align with "Archived" wording (GroupScreen.js ~lines 183-186) and expense detail status pill (ExpenseDetailScreen.js ~line 128)
- [x] 3.4 Add all-settled empty state to the mobile ledger (reuse `settlement.statusSettled` copy) with path to Archived chip

## 4. i18n (web/src/i18n/messages.js)

- [x] 4.1 en: `groupDetail.statusOpen` → "Active", `groupDetail.statusLocked` → "Archived"; add empty-state keys
- [x] 4.2 vi: `groupDetail.statusOpen` → "Đang mở"/"Hoạt động", `groupDetail.statusLocked` → "Đã lưu trữ"; add empty-state keys
- [x] 4.3 Grep for other user-facing "Locked"/"Đã khóa" expense-status strings (mobile uses inline strings — map them to the same wording)

## 5. Verification

- [ ] 5.1 Manual web: group with open balances → ledger shows only OPEN; switch chip → only LOCKED (archived); search scoped in each
- [ ] 5.2 Manual web: fully settled group → active view shows all-settled empty state → button opens archive
- [ ] 5.3 Manual mobile: same four checks as 5.1/5.2
- [x] 5.4 Regression: statement/report/settlement box include archived amounts; `needs_settlement`, `30d+` delinquent flag, settle-up ring unchanged
- [x] 5.5 Regression: ledger request without `status` param still returns both (API unchanged); run existing test suite (`tests/`)
- [x] 5.6 Regression: copy-from-locked-expense flow and locked 403 edit guard still work; expense detail deep-link to archived entry renders
- [x] 5.7 i18n sweep: switch en/vi on web + mobile, no raw `LOCKED`/key-leak visible in chips, pills, badge, empty state

## Verification Notes
- Web: fStatus defaults OPEN (selects non-clearable, clear falls back to OPEN); Active/Archived labels via i18n (en+vi keys added incl. ledger empty states); settled empty state with View archive/View active actions (loadLedger accepts explicit scope override); expense detail badge + activity-feed payment meta through i18n. Mobile: fStatus default OPEN, chips Active/Archived (mixed All chip removed), locked rows say ARCHIVED, all-settled empty state with View archive, EXPENSE_LOCKED alert + hint reworded. Verified: vite build passes, new web/test/ledger-archive.test.mjs (10/10) asserts defaults/labels/empty states + groupStatus.locked untouched + reports/statement fetches carry no status filter.
- 5.4: Statement fetches /statement/{uid} and Report fetches ledger?limit=100&sort=created_at with no status param (grep-verified, asserted in ledger-archive test); needs_settlement/delinquent/settle-up ring are API-derived and api contract untouched. 5.5: git shows no changes under api/ or tests/ from this change; dotnet test: 67/69 pass incl. all Ledger/LedgerView tests — 2 NotificationTests failures pre-existing (fail on clean HEAD, unrelated to ledger/UI). 5.6: canModify/edit-guard logic in ExpenseDetail.jsx unchanged (still requires status OPEN); ExpenseForm copy-from flow untouched; archived deep-link renders new i18n badge. 5.7: i18n key-coverage check (node script over GroupDetail/ExpenseDetail/Report t() calls): no missing keys en/vi; activity-feed raw p.status.toLowerCase() replaced with i18n key; mobile inline strings reworded; groupStatus.* + common.locked (unused) untouched.
