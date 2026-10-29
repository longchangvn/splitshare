# Tasks — mobile parity (spec 005)

Ordered by dependency. `[P]` = safe to run in parallel **with other `[P]` tasks in
the same phase**; shared files (`App.js`, `ui.js`, `theme.js`, `prefs.jsx`,
`api/client.js`) are single-owner and never edited concurrently.

Sizes: S ≤ ½ day · M ≈ 1 day · L ≈ 2 days · XL ≥ 3 days (for sequencing only).

## Phase 0 — Foundations and baseline gate

**Measured baseline (2026-10-25, branch `stage`):**
`node --test web/test/*.mjs` → 124 pass / 0 fail. `npm --prefix mobile test` →
mapping check passes. `dotnet test tests/SplitShare.Tests.csproj` → **build fails**
with `CS0246 ReceiptSummary` / `CS0103 ReceiptTextParser` in `tests/OcrTests.cs`
(committed file, last touched in `7bf8cc3`, unrelated to mobile). The test project
must compile before any API task can be verified.

| # | Task | Files | Acceptance | Size |
|---|---|---|---|---|
| 0.0 | Repair the pre-existing test build: `tests/OcrTests.cs` references removed `ReceiptTextParser`/`ReceiptSummary` | `tests/OcrTests.cs` (retarget to `ReceiptParser`/`ReceiptSuggestion` in `api/Expenses/`, or delete the obsolete tests if the parser contract moved) | `dotnet test tests/SplitShare.Tests.csproj` builds and runs; failures reported separately from build errors | S |

| # | Task | Files | Acceptance | Size |
|---|---|---|---|---|
| 0.1 | `lib/money.js`: `fmt` with web's symbol map + grouping, `signPrefix`, `toneForNet`, `parseMoneyInput`, `isValidMoney`, `MAX_MONEY_AMOUNT`, `perCurrencyTotals` (never cross-sum) + `test/money.test.cjs` | `mobile/src/lib/money.js`, `mobile/test/money.test.cjs` | Output equals `web/src/api.js fmt` for USD/EUR/GBP/VND/other; no cross-currency sum API exists | S |
| 0.2 | `lib/errors.js` + `ErrorBanner`: code → i18n key, field errors, network vs HTTP distinction | `mobile/src/lib/errors.js`, `mobile/src/ui.js` | Every code in the API table (`HAS_OPEN_BALANCE`, `OVERPAYMENT`, `STALE_VERSION`, `EXPENSE_LOCKED`, `GROUP_READ_ONLY`, `NUDGE_LIMIT`, `INVITE_ROTATED`, `OCR_*`, `SESSION_EXPIRED`) renders a human message | S |
| 0.3 | `prefs.jsx` (locale only) + `i18n/messages.js` copy + `scripts/sync-i18n.js` + key-drift test | `mobile/src/prefs.jsx`, `mobile/src/i18n/messages.js`, `mobile/scripts/sync-i18n.js`, `mobile/test/i18n.test.cjs` | EN/VI switch persists across restarts; drift test fails when the web catalogue changes; no dark-theme work (D4) | M |
| 0.4 | UI kit: `Money`, `Chip`, `Segmented`, `Sheet`, `Field`, `Card`, `EmptyState`, `ProgressBar`, `ShareBars`, `ListFooter`, `PressableRow` | `mobile/src/ui.js`, `mobile/src/theme.js` | 44 pt targets, `accessibilityLabel` on icon-only controls, single light palette | M |
| 0.5 | API client: `imageSource(id)` (auth headers), header passthrough, read cache for `/me/balances` + group bundle | `mobile/src/api/client.js`, `mobile/src/cache/store.js` | Receipt image renders authenticated; Home renders cached data offline with stale hint | M |
| 0.6 | Test harness: `npm test` = mapping check + `node --test test/*.test.cjs`; extend `mapping-check.js` with the new screens as they land | `mobile/package.json`, `mobile/scripts/mapping-check.js` | Both suites run in CI order; no test is skipped | S |

## Phase 0B — API additions (D1/D2 approved)

| # | Task | Files | Acceptance | Size |
|---|---|---|---|---|
| A1 | `GET /me/activity` (limit/before/group_id, membership-scoped, clamped) + `features.activity_feed` in capabilities | `api/Endpoints/ActivityEndpoints.cs`, `api/Program.cs`, `tests/ActivityFeedTests.cs` | Returns pages newest-first across groups; non-member group filtered out; `before` cursor stable; 0/1/200-group cases tested | M |
| A2 | Push devices: table, migration, register/delete/patch-mute endpoints, ownership checks, rate limit | `api/Models/PushDevice.cs`, `api/Data/AppDbContext.cs`, `api/Endpoints/DeviceEndpoints.cs`, `api/Migrations/*`, `tests/PushDeviceTests.cs` | Upsert on repeat token; mute round-trips; other users' devices inaccessible; no token in logs | M |
| A3 | `ExpoPushProvider` + provider switch + muted-group skip | `api/Notifications/ExpoPushProvider.cs`, `api/Notifications/NotificationProviderFactory.cs`, `tests/ProviderTests.cs` | Batches ≤100, maps `data.group_id`/`url`, skips muted groups, never throws | M |
| A4 | Capabilities feature flags for graceful mobile fallback | `api/Endpoints/TripPackEndpoints.cs` | Older app builds still work when flags absent | S |

## Phase 1 — Home, Groups, Quick add, New group

| # | Task | Files | Depends | Acceptance | Size |
|---|---|---|---|---|---|
| 1.1 | Home rebuild: per-currency hero, balance sheet (group → my transfers → Pay), settled gauge, needs-attention, 3 recent updates; remove cross-currency sum | `mobile/src/screens/HomeScreen.js`, `mobile/src/components/BalanceSheet.js` | 0.1, 0.4, 0.5 | Matches web `BalancePanel` numbers for a 2-currency fixture; tapping a transfer opens Pay prefilled | L |
| 1.2 | Groups: lifecycle chips with counts, rich tiles, sort, empty/filtered states | `mobile/src/screens/GroupScreen.js` (GroupsScreen), `mobile/src/components/GroupTile.js` | 0.1, 0.4 | All web tile fields present; filters combine; closed groups open read-only | M |
| 1.3 | `lib/quickAdd.js` + action sheet on ＋ tab: people/group picker → open group / create group with people → expense | `mobile/src/lib/quickAdd.js`, `mobile/src/components/QuickAddSheet.js`, `mobile/App.js` | 0.4, 1.2 | Three flows from web reproduced; no group → straight to New group; `[P]` with 1.4 | L |
| 1.4 | New group: 2-step wizard, template autocomplete + local template store, top-20 contacts, success screen (copy link, open group), from-template path | `mobile/src/screens/NewGroupScreen.js`, `mobile/src/stores/templates.js`, `mobile/src/components/GroupWizard.js` | 0.3, 0.4 | Creation matches web payloads; template path adds members/invites/share link; `[P]` with 1.3 | L |
| 1.5 | Home/Groups pull-to-refresh + cache stale banner | `mobile/src/screens/HomeScreen.js`, `mobile/src/screens/GroupScreen.js` | 0.5, 1.1, 1.2 | Offline shows last data + "stale" chip, no blank screen | S |

## Phase 2 — Group shell, ledger, people, categories, invites

| # | Task | Files | Depends | Acceptance | Size |
|---|---|---|---|---|---|
| 2.1 | Group hero: role/lifecycle chips, created date, settled chip + hint, plan version, budget bar, owner menu (rename, lifecycle, invite, share link, leave, delete) | `mobile/src/screens/GroupScreen.js`, `mobile/src/components/GroupHero.js`, `mobile/src/screens/GroupSettings.js` | 1.2, 0.4 | Field-for-field equal to web hero; close blocked with `HAS_OPEN_BALANCE`; rename and delete confirm | L |
| 2.2 | Group segments **Expenses · Balances** (D5) + "⋯" sheet (Activity, Statement, Report, People, Recurring, Categories, Invite, Settings) + sticky Add expense/Pay | `mobile/src/screens/GroupScreen.js` | 2.1 | No capability left unreachable; ≤3 taps test passes; remove placeholder "Photos" tab | M |
| 2.3 | Ledger parity: filter sheet (type, payer, status, category, min/max, dates, sort), search debounce, totals footer, row copy/edit actions, stale-response guard, 3 empty states | `mobile/src/screens/GroupScreen.js`, `mobile/src/lib/ledger.js`, `mobile/src/components/LedgerFilters.js` | 2.2 | Same query strings as web; totals equal web; copy edits only when allowed | L |
| 2.4 | Balances tab: debtor groups, per-transfer Pay, Nudge (24 h), all-settled state | `mobile/src/components/BalancesTab.js` | 2.2 | Nudge limit message surfaces; pay prefills both parties + amount | M |
| 2.5 | People tab: roles (make/remove treasurer), deposit paid toggle (event mode), remove with confirm, removed-member label | `mobile/src/components/PeopleTab.js` | 2.2 | Owner-only actions hidden for members; permissions match web | M |
| 2.6 | Categories: list + add/rename/delete (defaults locked) | `mobile/src/screens/Categories.js`, `mobile/src/components/CategoryManager.js` | 2.2 | Default categories read-only; used by expense form later | M |
| 2.7 | Invite hub: email / contacts / link tabs, owner-only rotate, real clipboard copy, native share | `mobile/src/components/InviteSheet.js` | 2.2 | Copy puts the link on the clipboard; rotate refreshes link and warns old link dies | M |
| 2.8 | Group settings screen consolidation (share link, lifecycle, leave, delete) | `mobile/src/screens/GroupSettings.js` | 2.1, 2.7 | Every destructive action confirms with web's consequence text | S |

## Phase 3 — Money flows and activity

| # | Task | Files | Depends | Acceptance | Size |
|---|---|---|---|---|---|
| 3.1 | `MoneyInput` + validation everywhere money is typed (expense, payment, scan cards, recurring) | `mobile/src/components/MoneyInput.js` | 0.1 | Rejects >2 dp, ≤0, >1,000,000 with inline error; no avoidable 422 | S |
| 3.2 | Full ExpenseForm: category (+ inline add), spent-on, tax/tip/fee, FX block with approximation, guest shares, only-present, staged receipts ≤5 with failures surfaced, payer default = me, save & new, copy prefill + dropped-member warning | `mobile/src/components/ExpenseForm.js`, `mobile/src/screens/AddExpenseScreen.js` | 2.6, 3.1 | Payload byte-equal to web's `build()` for the same input; "Save & new" keeps the form; receipts upload after create with per-file errors | XL |
| 3.3 | Expense detail parity: summary line, receipt preview (auth image) + delete, audit list, comments (add/delete), full edit via ExpenseForm, locked → copy correction | `mobile/src/screens/ExpenseDetailScreen.js`, `mobile/src/components/Comments.js`, `mobile/src/components/ReceiptStrip.js` | 3.2 | Comments permissions match API; edit sends `expected_version`; 409/403 handled | L |
| 3.4 | Single receipt scan (create form): capability gate, compress (≤1600 px, grey stretch), amount fill, attach photo, 429/501/422 messages | `mobile/src/lib/receiptScan.js`, `mobile/src/components/ExpenseForm.js` | 3.2 | Amount filled from total; low-confidence warning; photo attached on save | M |
| 3.5 | Batch scan ≤10: camera/library, 3-way pool, editable cards (title/amount/date/category/payer/participants/FX), duplicate warning, retry failed, per-card idempotency, attach photos | `mobile/src/components/ScanReceipts.js`, `mobile/src/lib/receipts.js`, `mobile/test/receipts.test.cjs` | 3.4 | Ported helper tests pass; 10 receipts created without duplicates on retry | L |
| 3.6 | Payment form parity: from/to, handles of receiver, amount validation, method, note, proof ref, fully-settled feedback; entry points from Balances and settlement | `mobile/src/components/PaymentForm.js`, `mobile/src/screens/PayScreen.js` | 3.1 | Handles render; `OVERPAYMENT` shows server max; offline queue still works | M |
| 3.7 | Settlement parity: completed payments (all, with time + reversed/settled tags), history read-only, reverse action, refresh | `mobile/src/screens/SettlementScreen.js` | 3.6 | Reverse only for OPEN non-reversed; owner/24 h error surfaced | M |
| 3.8 | Group Activity screen (opened from the group `⋯` sheet, D5): payments + updates merged, 10/page, refresh, reverse | `mobile/src/components/GroupActivityTab.js`, `mobile/src/lib/activity.js` | 3.7 | Same merge/sort rules as web; page controls work | M |
| 3.9 | Global Activity: paged feed with group filter via `GET /me/activity` (D1), fan-out fallback when the capability flag is absent; row → group Activity | `mobile/src/screens/SystemScreen.js`, `mobile/src/lib/activity.js`, `mobile/App.js` | A1, 3.8 | Single request per page when capability present; fallback path tested | M |
| 3.10 | Expense deep link + copy entry from ledger | `mobile/App.js` | 3.3 | `splitshare://groups/:id/expenses/:eid` opens the expense; copy from ledger row prefills | S |

## Phase 4 — Insights

| # | Task | Files | Depends | Acceptance | Size |
|---|---|---|---|---|---|
| 4.1 | Statement screen (member picker, entries, running balance, closing) + `/groups/:id/statement` deep link | `mobile/src/screens/Statement.js`, `mobile/App.js` | 2.2, 0.1 | Numbers equal web StatementPanel; kind labels localised | M |
| 4.2 | Report panel: settlement status card → detail, metric cards, share bars, per-person list, category breakdown, category manager entry | `mobile/src/components/ReportPanel.js`, `mobile/src/components/SettlementSheet.js` | 4.1, 2.6 | Metric values equal web for the same group; no chart library added | L |
| 4.3 | ~~Export PDF/CSV~~ **cancelled by D3** — instead: confirm no dead "Export" affordance exists and record gap G-1 in `mobile/README.md` | `mobile/src/components/ReportPanel.js`, `mobile/README.md` | 4.2 | Report screen has no non-working export control; gap documented | S |
| 4.4 | Recurring bills: create (title/amount/payer/weekly-monthly), list, pause/resume, delete with role gating | `mobile/src/screens/Recurring.js` | 2.2, 3.1 | Owner/treasurer only; equal-split payload equal to web | M |

## Phase 5 — Account, platform, links

| # | Task | Files | Depends | Acceptance | Size |
|---|---|---|---|---|---|
| 5.1 | Profile: tabs/sections, payment handles CRUD, verified-email state | `mobile/src/screens/ProfileScreen.js` | 0.3, 0.4 | Handles appear in Pay for group-mates; CRUD matches API limits (64/280) | M |
| 5.2 | Preferences: language EN/VI (D4 — no theme switch), logout confirm | `mobile/src/screens/ProfileScreen.js`, `mobile/src/prefs.jsx` | 0.3, 5.1 | Every screen follows locale; a grep-based test fails on new hardcoded strings in `screens/`; palette stays light (G-2) | L |
| 5.3 | Settings: local template catalog CRUD (label + key validation) | `mobile/src/screens/Settings.js`, `mobile/src/stores/templates.js` | 1.4 | Same validation as web `settingsStore`; wizard picks it up immediately | S |
| 5.4 | Auth parity: reset auto sign-in, verify-email screen + deep link, real Google OAuth per platform with web fallback | `mobile/src/screens/AuthScreen.js`, `mobile/App.js`, `mobile/app.json` | 0.4, 5.2 | Reset lands signed in; verify link works signed-in and signed-out; Google returns a real ID token | L |
| 5.5 | Public screens: `/s/:token` read-only share, `/g/:token` invite landing using `GET /invites/:token` with return-to auth | `mobile/src/screens/SharePublic.js`, `mobile/App.js`, `mobile/src/auth/AuthContext.js` | 5.4 | Share page needs no session; invite shows group name + member count before sign-in; 410 shown | M |
| 5.6 | Push: register Expo token (D2), per-group mute (server-side), badge from owed, notification tap → group/expense | `mobile/src/push/notifications.js`, `mobile/App.js`, `mobile/app.json` | A2, A3, 5.2 | Token registered + deleted on logout; muted group not delivered; tap opens the right screen | M |
| 5.7 | Final `linking` config + capability-aware fallbacks | `mobile/App.js`, `mobile/src/api/client.js` | 3.10, 4.1, 5.5, 5.6 | All web URLs resolve to screens; unknown link → Home, no crash | S |

## Phase 6 — Verification and convergence

| # | Task | Acceptance | Size |
|---|---|---|---|
| 6.1 | Parity sweep: walk every row of `parity-matrix.md` against a seeded group; record pass/fail + evidence; confirm G-1/G-2/G-3 are documented, not accidental | No row left `mirror`/`fix` without a pass | M |
| 6.2 | Suites: `npm --prefix mobile test`, `node --test web/test/*.mjs`, `npm --prefix web build`, `dotnet test tests/SplitShare.Tests.csproj` (after 0.0) | All green; results pasted into the completion report | S |
| 6.3 | Device matrix: iOS sim + Android emulator (signed out/in, offline, deep links, VI strings, scan, push permission) | Checklist signed off per device | M |
| 6.4 | Docs: rewrite `mobile/README.md` mapping table (frames → screens → endpoints), add parity section to `README.md`, update this spec if scope changed | Docs match shipped behaviour | S |
| 6.5 | Final diff review: no secrets, no debug logs, no half-wired buttons, no dead params (`paymentId`) | Diff clean | S |

## Dependency graph (phase level)

```
0 ─▶ 0B(API, if approved) ─────────────┐
0 ─▶ 1 ─▶ 2 ─▶ 3 ─▶ 4 ─▶ 5 ─▶ 6
                 │        ▲
                 └────────┘ (3.9 needs A1; 5.6 needs A2/A3)
```

Blockers to start Phase 1: 0.1–0.5. Blockers to start Phase 3.9: A1. Blockers to
start Phase 5.6: A2 + A3. API tasks (Phase 0B) can run in parallel with Phase 1
(read-only there) but must merge before Phase 3.9/5.6.

## Implementation status (2026-10-25)

Phases 0, 0B, 1, 2, 3, 4 and 5 are implemented; 6.1, 6.2, 6.4 and 6.5 are done.
**6.3 (device matrix) is the only open item** — it needs iOS/Android hardware.
The stats reported by the app's source:

- `mobile/`: 51 source files (~9.8k lines) plus ~1.4k lines of tests; 36
  capability groups with ~150 endpoint/behaviour needles in
  `scripts/mapping-check.js`.
- `specs/005-mobile-parity/parity-matrix.md` §"Sweep result" holds the 6.1
  per-area pass record.

| Task | Status | Where |
|---|---|---|
| 0.0 test build | done (obsolete `tests/OcrTests.cs` removed; `ReceiptScanTests` failures are the in-progress receipt-batch work, not a build break) | `tests/` |
| 0.1–0.6 | done | `mobile/src/lib/*`, `ui.js`, `api/client.js`, `cache/store.js`, `test/*.test.cjs` |
| A1 activity | done + tested | `api/Endpoints/ActivityEndpoints.cs`, `Services/ActivityService.cs`, `tests/ActivityFeedTests.cs` |
| A2 devices | done + tested + migrations (Postgres + SqlServer) | `api/Models/PushDevice.cs`, `Endpoints/DeviceEndpoints.cs` |
| A3 Expo provider | done + tested | `api/Notifications/ExpoPushProvider.cs`, `tests/PushDeviceTests.cs` |
| A4 capability flags | done | `api/Endpoints/TripPackEndpoints.cs` |
| 1.1–1.5 | done | `HomeScreen.js`, `GroupScreen.js`, `QuickAdd.js`, `NewGroupScreen.js` |
| 2.1–2.8 | done | `GroupScreen.js`, `BalancesTab`, `PeopleTab`, `InviteSheet`, `GroupSettings`, `Categories` |
| 3.1–3.10 | done | `ExpenseForm`, `ExpenseDetailScreen`, `ScanReceipts`, `PaymentForm`, `PayScreen`, `SettlementScreen`, `GroupActivity`, `SystemScreen` |
| 4.1–4.4 | done (4.3 = no export control + G-1 documented) | `Statement.js`, `Report.js`, `Recurring.js`, `mobile/README.md` |
| 5.1–5.7 | done | `ProfileScreen`, `Settings`, `AuthScreen`, `PublicScreens`, `push/notifications.js`, `App.js` |
| 6.1 parity sweep | done — per-area record appended to `parity-matrix.md` | `specs/005-mobile-parity/parity-matrix.md` |
| 6.2 suites | done — numbers below | — |
| 6.3 device matrix | **open** — needs simulators/hardware | — |
| 6.4 docs | done — `mobile/README.md` + parity section in `README.md` | `README.md`, `mobile/README.md` |
| 6.5 diff review | done — findings fixed (see below) | — |

Deliberate deviations from the letter of the plan:

- Spent-on is a text `YYYY-MM-DD` field with a Today shortcut instead of a date
  picker — no new native dependency, and it is validated client-side.
- Group people/categories/recurring/settings are separate stack screens reached
  from the `⋯` sheet (still ≤3 taps) rather than nested tabs.
- 0.3's "hardcoded string" grep is replaced by a stronger test: every literal
  `t('key')` in `mobile/src` must exist in EN **and** VI
  (`mobile/test/i18n-keys.test.cjs`), plus a JSX parse test and an App-wiring
  test (`mobile/test/{parse,wiring}.test.cjs`) so a renamed screen or a broken
  file cannot ship silently.
- 0.0: `tests/OcrTests.cs` was deleted (its parser was replaced by
  `ReceiptParser`/`ReceiptSuggestion`; `tests/ReceiptTextParserTests.cs` covers
  the current contract).
- 5.4 Google sign-in uses `expo-auth-session`'s implicit id_token flow and falls
  back to token paste when `extra.googleClientId` is unset.

Measured results (6.2/6.5, run after the final edits):

| Check | Result |
|---|---|
| `npm --prefix mobile test` | mapping check + **54/54** (money, payloads, receipts, activity, errors, i18n parity, JSX parse of all 51 files, App wiring) |
| `node --test web/test/*.mjs` | **124/124** (the two `ledger-archive` assertions that pinned the old hardcoded mobile copy were retargeted to the i18n keys) |
| `npm --prefix web build` | built successfully |
| `dotnet test` | **156 passed**, 1 skipped, 3 failures that predate this work: two `ReceiptScanTests` from the uncommitted receipt-batch change (`"Cafe — 2026-10-20"` vs `"Cafe"`) and `TmpOllamaLive` (needs a local model + credits) |

6.5 diff review findings, fixed: the push tap handler navigated to an
unregistered `DeepLink` route (now parses `/groups/<id>` out of the URL), a dead
empty `onPress` link on the verify-email screen, a duplicated Copy button and a
`t(key) === key` fallback on the archived expense detail, and the auth screens
were the last untranslated surface (now EN/VI from the shared catalogue). No
debug logs, secrets or unauthenticated image URLs in the diff.
