# Parity matrix — web → mobile

Legend — **Action**: `align` = mobile has it, behaviour must match web;
`mirror` = missing on mobile, port it; `keep` = mobile-only, stays;
`fix` = mobile bug/divergence to correct; `adapt` = same data, mobile-native UI.
**Phase**: see `tasks.md`.

## A. Account & session

| # | Capability | Web source | Mobile today | Action | Phase |
|---|---|---|---|---|---|
| A1 | Login (username/email + password) | `pages/AuthPages.jsx` 103 | `screens/AuthScreen.js` | align | 5 |
| A2 | Register + auto-consume pending invites | `AuthPages.jsx` 161 | `AuthScreen.RegisterScreen` | align (web has no phone field; mobile keeps optional phone) | 5 |
| A3 | Google sign-in (real OAuth, not token paste) | `AuthPages.jsx` 211–360, `googleReturn.js` | manual ID-token paste, native flow unwired | fix | 5 |
| A4 | Forgot password | `AuthPages.jsx` 474 | `ForgotScreen` | align | 5 |
| A5 | Reset password → auto sign-in | `AuthPages.jsx` 515 (`setTokens`) | `ResetScreen` returns to login | fix | 5 |
| A6 | Verify email page + deep link | `AuthPages.jsx` 550, route `/verify/:token` | missing | mirror + deep link | 5 |
| A7 | Logout (revokes refresh token) | `auth.jsx` | `AuthContext` | align | 5 |
| A8 | Single-flight reactive refresh | `api.js` | `api/client.js` | align (already equal) | — |
| A9 | Biometric unlock | — | `AuthContext` + SecureStore | keep | — |
| A10 | Light/dark theme | `prefs.jsx`, `theme.js` | fixed light palette | **accepted gap G-2** (D4: no dark theme) | — |
| A11 | Language EN/VI | `i18n/messages.js` (1.5k strings) | hardcoded English | mirror (D4 approved: EN/VI only) | 5 |

## B. Home

| # | Capability | Web source | Mobile today | Action | Phase |
|---|---|---|---|---|---|
| B1 | Netted balance per currency (never summed) | `pages/Dashboard.jsx`, `balance.js`, `/me/balances.balance` | hero uses `USD` else sums **all** currencies | fix | 1 |
| B2 | Balance breakdown: per open group + optimizer transfers involving me | `Dashboard.BalancePanel` | missing (data already in `my_transfers`) | mirror | 1 |
| B3 | Settled gauge (settled/total groups) | `Dashboard` ring | missing | mirror (bar) | 1 |
| B4 | Recent activity (5 across groups) | `Dashboard.HistoryCard` | missing on Home (Activity tab has 20) | mirror | 1 |
| B5 | "Needs attention" groups (owe/owed) | group list card | flat list by currency | adapt | 1 |

## C. Groups list

| # | Capability | Web source | Mobile today | Action | Phase |
|---|---|---|---|---|---|
| C1 | Lifecycle filter chips opening/locked/closed + counts | `Dashboard.GroupsPage` | missing | mirror | 1 |
| C2 | Rich tile: lifecycle, group settled chip, my net, member count, total spend, owner badge, 30d flag | `Dashboard.GroupTile` | name + absolute net only | mirror | 1 |
| C3 | Empty / filtered-empty states | `Dashboard.GroupsPage` | empty only | align | 1 |

## D. Quick add

| # | Capability | Web source | Mobile today | Action | Phase |
|---|---|---|---|---|---|
| D1 | FAB picker: people and/or one group → open group / create group then expense / prefill wizard | `components/QuickAddExpense.jsx`, `quickAdd.js` | Add tab jumps straight to New group | mirror | 1 |
| D2 | Add tab = action sheet (expense / payment / scan / new group) | — | mislabelled shortcut | fix (IA) | 1 |

## E. New group

| # | Capability | Web source | Mobile today | Action | Phase |
|---|---|---|---|---|---|
| E1 | Name 3–50 validation, step 1 → step 2 | `Dashboard.GroupWizard` | single screen, validates | align | 1 |
| E2 | Template autocomplete from local catalog | `settingsStore.js`, `wizardUtils.js` | missing | mirror | 1 |
| E3 | "Your contacts" top-20 default list | `Dashboard.GroupWizard` | search only | mirror | 1 |
| E4 | Emails (multi) inline | same | yes | align | — |
| E5 | Success screen: summary, copy invite link, open group | `GroupCreated` | alert + link text | mirror | 1 |
| E6 | Create from template (+members/invites/share-link) | `Dashboard.create` | missing | mirror | 1 |
| E7 | Currency selection | fixed `USD` | 5-currency picker | keep (superset) | — |

## F. Group detail

| # | Capability | Web source | Mobile today | Action | Phase |
|---|---|---|---|---|---|
| F1 | Hero: role tags, created date, settled/open chip + hint, plan version, member count, currency, mode | `pages/GroupDetail.jsx` 640–760 | name + currency + members | mirror | 2 |
| F2 | Rename group (owner) | `saveRename` | missing | mirror | 2 |
| F3 | Lifecycle picker + confirm (closing blocked with open balance) | `requestGroupStatusChange` | missing | mirror | 2 |
| F4 | Budget bar (spent/budget, % , alert/over) | `gd-budget` | missing | mirror | 2 |
| F5 | Invite hub: email / contacts / link, rotate (owner), copy | `inviteOpen` modal, `pages/InvitePage.jsx` | sheet with all three; "copy" = share sheet; no role gating of link | align/fix | 2 |
| F6 | Report panel: settlement status → detail, metrics, charts, per-person, categories, category manager, print | `pages/Report.jsx`, `SettlementBox.jsx` | missing | mirror/adapt | 4 |
| F7 | Tab set & placeholders | 6 tabs + report | 4 segments, "Photos" placeholder has no web counterpart | fix (D5: Expenses · Balances + sheet) | 2 |
| F8 | Ledger filters: type, payer, status, category, min/max, dates, sort + totals + copy/edit row actions | `loadLedger`, ledger rows | search + OPEN/LOCKED only, no totals, no row actions | mirror | 2 |
| F9 | Ledger empty states (archive empty / all settled → archive / no active) | `ledgerEmpty` | partial (2 of 3) | align | 2 |
| F10 | Balances tab: debtor → creditor rows, nudge, pay per transfer | `BalancesPanel`, `byDebtor` | transfers only on Settlement screen, no nudge | mirror | 2 |
| F11 | Statement tab (member select, running balance, closing) | `pages/Statement.jsx` | missing | mirror | 4 |
| F12 | People: role change (treasurer), deposit paid (event), remove with confirm | `people` tab | remove only | mirror | 2 |
| F13 | Activity: payments + updates merged, 10/page, reverse payment, refresh | `activityFeed` | missing | mirror (reached from the `⋯` sheet, D5) | 3 |
| F14 | Recurring bills: create (title/amount/payer/weekly-monthly), pause/resume, delete | `RecurringForm`, `RecurringRuleList` | missing | mirror | 4 |
| F15 | Categories: list, add, rename, delete (defaults locked) | `CategoryManager`, `categories.js` | missing | mirror | 2 |
| F16 | Nudge a debtor (24 h server limit) | `nudge` | missing | mirror | 2 |
| F17 | Reverse a payment (owner, open, 24 h) | `reversePay` | dead `paymentId` path | fix | 3 |
| F18 | Export PDF (print) | `exportPdf` + print styles | missing | **accepted gap G-1** (D3: no export on mobile) | — |
| F19 | Copy invite link actually copies | `CopyButton` | `Share.share` only | fix (`expo-clipboard`) | 2 |

## G. Expense create/edit

| # | Capability | Web source | Mobile today | Action | Phase |
|---|---|---|---|---|---|
| G1 | Title/amount/payer/participants/split preview | `components/Forms.jsx` | yes | align (payer default = me) | 3 |
| G2 | Amount sanitising + validation (2 dp, > 0, ≤ 1,000,000) | `sanitizeMoneyInput` | none | fix | 3 |
| G3 | Category select + inline add category | `ExpenseForm` | missing | mirror | 3 |
| G4 | Spent-on date | `spentAt` | missing | mirror | 3 |
| G5 | Tax / tip / fee | `billDetails` | missing | mirror | 3 |
| G6 | Foreign currency: code, amount, rate, approximate total | same | missing | mirror | 3 |
| G7 | Guest shares (label, amount, covered by) | same | missing | mirror | 3 |
| G8 | Only-present toggle | same | missing | mirror | 3 |
| G9 | Staged receipts ≤5 with per-file size/list/partial-failure handling | `staged`, `uploadStaged` | count only, failures swallowed | align | 3 |
| G10 | Single receipt scan → amount + attach photo | `onScanFile`, `receiptScan.js` | missing | mirror | 3 |
| G11 | Batch scan ≤10: camera/library, pool of 3, editable cards, duplicate detection, retry failed, per-card idempotency | `components/ScanReceipts.jsx`, `receiptBatch.js` | missing | mirror | 3 |
| G12 | Copy expense: prefill, "Copy of …", dropped-former-member warning, no receipts | `copyFrom` | `copyFrom` supported, no entry point from ledger, no warning | align | 3 |
| G13 | Save & new | `onSaveNew` | missing | mirror | 3 |
| G14 | Un-settle blocking confirm on edit | `submitEdit` | yes | align | 3 |
| G15 | Live server preview + EQUAL floor/1¢ note | `preview` | yes | align | 3 |

## H. Expense detail

| # | Capability | Web source | Mobile today | Action | Phase |
|---|---|---|---|---|---|
| H1 | Category/date/tax/tip/fee/FX/guests summary line | `pages/ExpenseDetail.jsx` | title/amount/payer only | mirror | 3 |
| H2 | Full edit (title, amount, payer, participants, split, category, date, extras) | `ExpenseForm existing` | title + amount | mirror | 3 |
| H3 | Delete (confirm, OPEN only) | `del` | yes | align | 3 |
| H4 | Copy | `copy` | yes | align | 3 |
| H5 | Splits list | `splits` | yes | align | — |
| H6 | Receipt thumbnails + upload + delete | `ImgView` | upload/delete, no preview | mirror | 3 |
| H7 | Change history (audit) | `<details>` | raw JSON dump | align | 3 |
| H8 | Comments: list, add (≤1000), delete (author/owner) | `Comments` | missing | mirror | 3 |
| H9 | Locked expense → copy as correction | `canModify` rules | copy only | align | 3 |

## I. Payments & settlement

| # | Capability | Web source | Mobile today | Action | Phase |
|---|---|---|---|---|---|
| I1 | Payment form: from/to, amount validation, method, note, proof reference | `PaymentForm` | from/to, amount, method, note | align | 3 |
| I2 | Receiver payment handles shown while paying | `users/{id}/handles` | missing | mirror | 3 |
| I3 | Fully-settled feedback + settlement version | `onDone` | yes | align | 3 |
| I4 | Settlement Why-box parity: nets, steps, transfers + pay, raw debts, completed payments (all, with time/status), history read-only, refresh | `SettlementBox.jsx` | present; completed truncated to 10, no status/time, history chips | align | 3 |
| I5 | Reverse payment from payment list | `reversePay` | dead path | fix | 3 |

## J. Activity tab (global)

| # | Capability | Web source | Mobile today | Action | Phase |
|---|---|---|---|---|---|
| J1 | Aggregated feed across groups, 10/page with page controls | `Dashboard.ActivityFeed` | latest 20, no paging, no group filter | mirror (+D1) | 3 |
| J2 | Row tap → that group's activity | `nav(state.tab)` | group only | align | 3 |
| J3 | Offline queue + sync-now | — | present | keep | — |
| J4 | Push: permission, per-group mute, badge | `onesignal.js` (web); no mute | token never registered → **no push arrives** | fix (+D2) | 5 |
| J5 | Notification tap → group / expense | — | no handler | mirror | 5 |

## K. Profile & settings

| # | Capability | Web source | Mobile today | Action | Phase |
|---|---|---|---|---|---|
| K1 | Account fields (name, phone, email verified) | `pages/Profile.jsx` | yes | align | 5 |
| K2 | Payment handles CRUD (`/me/handles`) | `Profile` payments tab | missing | mirror | 5 |
| K3 | Change password | yes | yes | align | — |
| K4 | Delete account (blocked with open balance) | yes | yes | align | 5 |
| K5 | Logout confirm | modal | immediate | fix | 5 |
| K6 | Settings: local template catalog CRUD | `pages/Settings.jsx` | missing | mirror | 5 |
| K7 | Offline queue visibility + manual sync | — | present | keep | — |

## L. Public & deep links

| # | Capability | Web source | Mobile today | Action | Phase |
|---|---|---|---|---|---|
| L1 | `/g/:token` join; anonymous landing with group name + return-to auth | `JoinPage`, `GET /invites/:token` | join only when authed; 410 message | mirror | 5 |
| L2 | `/s/:token` public read-only share (members paid/share/net + transfers) | `pages/SharePage.jsx` | missing | mirror | 5 |
| L3 | Deep links: expense detail, statement, report, verify, share | `App.jsx` routes | group, join, reset only | mirror | 5 |
| L4 | Invite link copy/share | `CopyButton`, `navigator.share` | share only | fix | 2 |

## M. Cross-cutting

| # | Capability | Web source | Mobile today | Action | Phase |
|---|---|---|---|---|---|
| M1 | Money formatting (`$1,789.32`, symbol map, sign prefix) | `api.js fmt`, `balance.js` | `USD 12.00` | fix | 0 |
| M2 | Error envelope → readable message per code | `auth.jsx Err` | `ErrText` shows raw code | align | 0 |
| M3 | Loading/empty/error states | skeletons + `Err` | mixed | align | 0 |
| M4 | Currency grouping never summed | invariant | violated on Home | fix | 1 |
| M5 | Receipt image viewing (auth-header fetch) | `ImgView` | no preview, `imageUrl` unusable for auth | fix | 3 |

Totals: **97 capabilities** — `mirror` 45, `align` 28, `fix` 15, `keep` 4,
`adapt` 1, plus **2 accepted gaps** (A10 theme, F18 export). Two rows carry a dual
label (F5 align/fix, F6 mirror/adapt). Every `mirror`/`fix`/`align` row has a task
in `tasks.md`; gaps are documented in `spec.md` §9.

## Sweep result (2026-10-25)

The rows above record the **pre-implementation** state. This sweep re-walked every
area after the port; "pass" means the capability exists on mobile with the same
endpoints/payload/permission rules as web, verified statically by
`mobile/scripts/mapping-check.js` (capability → file → endpoint needles),
`mobile/test/{wiring,parse}.test.cjs` (every screen parses, every route exists),
and the unit suites for shared logic. Behaviour that needs a device (camera,
biometrics, push delivery, VI layout) is item 6.3 and is **not** claimed here.

| Area | Rows | Result | Evidence |
|---|---|---|---|
| A Account & session | A1–A10 | pass, except A10 = gap G-2 | `AuthScreen.js` (login, register + auto-join, Google id_token flow with paste fallback, forgot, reset → signed in, verify + `/verify/:token`), `ProfileScreen.js` (locale, password, handles, delete) |
| B Home | B1–B5 | pass | `HomeScreen.js` per-currency hero + balance sheet + transfers → Pay, settled gauge, recent updates; `lib/money.js` `buildBalance`/`perCurrencyTotals` unit-tested (no cross-currency sum) |
| C Groups list | C1–C4 | pass | `GroupScreen.js` `GroupsScreen`: lifecycle chips with counts, rich tiles, sort, empty/filtered states |
| D Quick add | D1–D3 | pass | `QuickAdd.js` + `lib/quickAdd.js` `resolveQuickAddFlow`: three web flows, people-only creates a default-named group |
| E New group | E1–E6 | pass | `NewGroupScreen.js`: 2-step wizard, template catalogue, top contacts, success screen, `from-template` path |
| F Group detail | F1–F18 | pass, except F18 = gap G-1 and D5 navigation deviation | `GroupScreen.js` hero/ledger/filters/totals/empty states, `BalancesTab`, `PeopleTab`, `InviteSheet`, `GroupSettings`, `Categories`, `Recurring`, `Statement`, `Report`, `GroupActivity`; Recurring/Categories/Settings are stack screens from the `⋯` sheet |
| G Expense create/edit | G1–G9 | pass | `ExpenseForm.js` + `lib/expensePayload.js` (build/patch tested against web's shape), tax/tip/fee, FX triple, guests, only-present, staged receipts ≤5, save & new, single + batch scan |
| H Expense detail | H1–H6 | pass | `ExpenseDetailScreen.js`: summary, splits/guests, authed receipt preview/delete, audit, comments, edit with `expected_version`, archive badge + copy correction |
| I Payments & settlement | I1–I5 | pass | `PaymentForm.js` (handles, OVERPAYMENT max, method/note/proof), `PayScreen.js` (+ reverse), `SettlementScreen.js` (why-box, completed, history, reverse) |
| J Global activity | J1–J4 | pass | `SystemScreen.js` via `GET /me/activity`, fan-out fallback when the flag is absent, group filter, paging, offline queue drain, push mutes |
| K Profile & settings | K1–K6 | pass | `ProfileScreen.js`, `Settings.js` (template catalogue), `prefs.jsx` (EN/VI persisted) — every screen reads copy through `useT` |
| L Public & deep links | L1–L4 | pass | `PublicScreens.js` (`/s/:token` needs no session, `/g/:token` shows group + member count, 410 `INVITE_ROTATED`), full `linking` map in `App.js`, clipboard copy + native share |
| M Cross-cutting | M1–M5 | pass | `lib/money.js` fmt parity, `lib/errors.js` code → localized message, skeletons/empty/error states in `ui.js`, receipt images fetched with auth headers |

Deviations from the letter of the plan (approved or documented, not accidental):
spent-on is a validated `YYYY-MM-DD` text field; report export omitted (G-1);
light palette only (G-2); group sub-areas live in one `⋯` sheet (G-3/D5, ≤3 taps).
