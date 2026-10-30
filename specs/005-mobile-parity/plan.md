# Implementation plan — mobile parity (spec 005)

## 1. Target information architecture

Bottom tabs stay 5: **Home · Groups · ＋ · Activity · You**.

```
Home
  balance hero (per-currency net)  ──tap──▶ Balance sheet
     per open group → transfers involving me → [Pay] (prefilled)
  settled gauge (bar) ──tap──▶ Groups (settled filter)
  needs attention (≤3 groups) ──tap──▶ Group · Balances
  recent activity (3) ──tap──▶ Activity
Groups
  filter chips: Opening · Locked · Closed (counts)
  tiles: lifecycle, settled chip, my net, members, total spend, 30d
＋ (action sheet)
  Add expense · Record payment · Scan receipts · New group
  (if no group picked: "which group?" list + people picker = web quick-add flows)
Group
  hero: name · role/lifecycle chips · members · currency · created · budget bar
  owner ⋯: Rename · Lifecycle · Invite · Share link
  my position card (+ n to settle → Balances)
  segments: Expenses | Balances                ⋯ sheet: Activity · Statement ·
            Report · People · Recurring · Categories · Invite · Group settings
  sticky actions: [Add expense] [Pay]
Activity
  group filter chips · infinite scroll · tap → group Activity
You
  account · payment handles · preferences (language) · notifications ·
  offline queue · security · delete account · log out (confirm)
```

Tap budget: pay suggested transfer = 3 (Home → balance sheet → Pay);
add expense in a group = 2; scan receipts = 3 (＋ → Scan → camera).

## 2. Architecture changes in `mobile/`

### 2.1 Pure logic modules (`mobile/src/lib/`, CommonJS so `node --test` can load them)

| Module | Responsibilities | Ported from |
|---|---|---|
| `money.js` | `fmt` (symbol map + grouping, identical output), `signPrefix`, `toneForNet`, `parseMoneyInput`, `isValidMoney`, `MAX_MONEY_AMOUNT`, per-currency helpers | `web/src/api.js`, `balance.js`, `Forms.jsx` |
| `ledger.js` | filter → query string, totals over loaded page, status/category label keys, row capability rules (`canEditExpense`) | `GroupDetail.jsx` |
| `activity.js` | merge payments + activity rows, sort, page slice, page tokens | `GroupDetail.jsx`, `Dashboard.jsx` |
| `receipts.js` | scan response → cards (`receipts[]` / `receipt` / flat), FX mismatch, duplicate detection, payload build, pool runner | `web/src/receiptBatch.js` |
| `quickAdd.js` | flow resolution (people/group/none), default group name, member merge | `web/src/quickAdd.js` |
| `errors.js` | error code → i18n key + server-field mapping | `web/src/auth.jsx`, screens |

These are the unit-test surface: no React, no network.

### 2.2 UI kit (`mobile/src/ui.js` + new `mobile/src/components/`)

`ui.js` gains: `Money`, `Chip`, `Segmented`, `Sheet` (bottom modal), `Field`
(label/error/hint wrapper), `Card`, `EmptyState`, `ErrorBanner`, `ProgressBar`,
`ShareBars` (replaces web donut/bar charts), `ListFooter` (load more),
`PressableRow` (accessible 44 pt row with trailing action).

New components: `components/ExpenseForm.js` (full form, ported from
`web/src/components/Forms.jsx`), `components/PaymentForm.js`,
`components/ScanReceipts.js`, `components/SettlementSheet.js`,
`components/ReportPanel.js`, `components/CategoryManager.js`,
`components/InviteSheet.js` (extracted from `GroupScreen.js`),
`components/ActivityList.js`, `components/GroupTile.js`,
`components/MoneyInput.js`.

Screens are rebuilt around these; `GroupScreen.js` (386 lines) becomes a
composition screen and splits into `GroupScreen` + `GroupExpensesTab`,
`GroupBalancesTab`, `GroupActivityTab`.

### 2.3 Navigation (`mobile/App.js`)

Add stack screens: `GroupActivity` (opened from the `⋯` sheet, D5), `Statement`,
`Report`, `GroupSettings` (rename/lifecycle), `Categories`, `Recurring`, `People`,
`Settings` (templates), `SharePublic`, `Verify`, `Invite` (group invite hub),
`ExpenseForm` (create/edit), `ScanReceipts`. Extend `linking.config`:

```
/s/:token → SharePublic      /g/:token → Join
/reset/:token → Reset        /verify/:token → Verify
/groups/:id/statement → Statement (params.id)
/groups/:id/report → Report
/groups/:id/expenses/:eid → ExpenseDetail
```

Auth gating: public screens (`SharePublic`, `Join` landing, `Login/Register/
Forgot/Reset/Verify`) live in the signed-out stack and are reachable via
`linking`; `Join` for an unsigned user shows group name from
`GET /invites/:token` with sign-in/sign-up (return-to preserved by keeping the
token in route params).

### 2.4 Session & data

- `api/client.js`: add `defaultHeaders` passthrough for `Idempotency-Key`;
  `getBlob` + `imageSource(id)` returning `{ uri, headers }` for authenticated
  `<Image>`; keep single-flight refresh. No retry on `POST` without a key.
- Light read cache: `src/cache/` (AsyncStorage, timestamped) for
  `/me/balances` and the group detail + first ledger page, so Home/Groups render
  instantly offline and show a stale banner. Write through on mutation. (No new
  dependency.)
- Offline queue unchanged; add `scan` retry policy note (scans are stateless,
  never queued).

### 2.5 Language (i18n) — theme stays light (D4)

- `PrefsProvider` (new `src/prefs.jsx`, ported from web's `prefs.jsx` minus the
  theme half) with `useT()`, `locale`, `setLocale`, persisted in AsyncStorage
  (`ss-locale`), default `en`.
- `src/i18n/messages.js` is **copied** from `web/src/i18n/messages.js` by
  `mobile/scripts/sync-i18n.js`; `npm --prefix mobile test` fails if key sets
  differ. (Copy chosen over a cross-package import: Expo managed + Metro
  `watchFolders` coupling is riskier than a checked-in copy with drift test.)
- Rule: no literal user-facing string in screens; all via `t('key')`. Server
  strings (group names, activity text, audit diff) stay as delivered.
- `theme.js` keeps one light palette, extended with any tokens the new UI kit
  needs. **No dark-lookalike refactor** (accepted gap G-2).

### 2.6 New dependencies (all Expo SDK 52 compatible, config-plugin free)

| Package | Why | Alternative rejected |
|---|---|---|
| `expo-clipboard` | real "copy invite link" (share sheet ≠ copy) | keep `Share.share` |
| `expo-web-browser` | open public share/policy links, Google web fallback | `Linking.openURL` (works, but no in-app return) |

Already present and reused: `expo-auth-session` (Google), `expo-image-picker`,
`expo-image-manipulator`, `expo-file-system`, `expo-sharing`,
`expo-local-authentication`, `expo-notifications`, `expo-secure-store`.
No chart, form, state or i18n library added.

## 3. API additions (approved 2026-10-25 — see spec §9)

### 3.1 D1 — aggregated activity feed (**approved**)

```
GET /api/v1/me/activity?limit=20&before=<ISO8601>&group_id=<guid>
200 { items: [ { kind, at, text, group_id, group_name, ref } ], next_before: <ISO|null> }
```
- Auth required; only groups where the caller is a current or archived member
  (same visibility as `CanViewAsync`); `limit` clamped 1–50.
- Reuses the existing per-group activity queries; one round trip replaces
  2×N from the client (web does 2×N today).
- Read-only, no schema change. `GET /capabilities` gains
  `features: { activity_feed: true }` so older app builds degrade to fan-out.

### 3.2 D2 — push device registration (**approved**)

```
POST   /api/v1/me/devices   { token, platform: "ios"|"android", muted_group_ids?: [guid] }
       201 { device_id, platform }
DELETE /api/v1/me/devices/{device_id}        200 { status: "deleted" }
PATCH  /api/v1/me/devices/{device_id}        { muted_group_ids: [guid] }   // mute toggles
```
- Token validated (length/charset), unique per (user, token); upsert on repeat
  registration (reinstall/refresh). One row per device; delete on logout.
- New `ExpoPushProvider : INotificationProvider` (`https://exp.host/--/api/v2/push/send`,
  batches ≤100, `data: { group_id, url, kind }`), selected with
  `Notification:Provider=expo`; provider selected per deployment, existing
  OneSignal config untouched. Skips muted groups for that recipient.
- EF migration adds `splitshare.push_devices` (user_id, token, platform,
  muted_groups_json, created_at, last_seen_at). No change to existing tables.
- Security: tokens are write-only to their owner (never returned in list form
  beyond id/platform), 1 request/min/user rate limit on register, no token in
  logs.

Fallback if declined: mobile keeps a local-only "notifications" UI and the plan
records push as an accepted gap.

### 3.3 D3 — report export: **declined**

No export action on mobile. The in-app report (Phase 4) shows the same numbers as
the web print doc (cover metrics, categories, transfers, per-person, statement);
the web's "Export PDF" stays web-only. `GET /groups/{id}/export.csv` remains
unused by both clients. Accepted gap G-1.

### 3.4 Not proposed

`GET /groups/{id}/bundle` (fewer round trips) — measurable benefit is small once
activity/push exist; revisit if group open > 1.2 s p95 on mid-range Android.
`PATCH /groups/{id}/settings` UI, flat-fee, payment proofs, legacy OCR — out of scope (spec §6).

## 4. Behaviour-parity details worth calling out

| Web behaviour | Mobile implementation |
|---|---|
| Payer defaults to me, else first member; copy keeps the source payer when valid | same rule (fix today's "first member") |
| Participants default to all members; unchecking stashes the typed value; SHARES defaults 1 | same (already ported) |
| Amount: strip non-digits, one dot, 2 dp, ≤1,000,000, >0; error copy from i18n | `lib/money.js` + `MoneyInput` |
| Live preview debounced 350 ms; server 422 is authoritative | same; preview failures stay silent until save |
| EQUAL explainer: floor + 1¢ remainder, names who gets the extra cent | same text keys |
| Un-settle: `preview-edit.unsettled_user_ids` → blocking confirm naming members | same; also on create if API ever returns them |
| Save & new: create → attach receipts → reset form, stay in form | same, with a "saved" toast |
| Batch scan: max 10 photos, 3 concurrent scans, per-card `Idempotency-Key`, duplicate (amount+day) warning, retry failed only | same, camera or library, keep photo on card |
| Ledger: default `status=OPEN`, `limit=100`, archive = `LOCKED`, totals of loaded page, stale-response guard | same; filter sheet replaces the desktop toolbar |
| Reverse payment: only OPEN, not reversed; server enforces owner/24 h | `⋯` on payment row in group Activity and settlement completed list |
| Nudge: only debtors, one per 24 h, server returns `NUDGE_LIMIT` | per-debtor Nudge button; show server message |
| Group close blocked with open balance → `HAS_OPEN_BALANCE` copy | same copy, confirm modal |
| Removed members appear in history as "Name (removed)" | group detail members + statement labels |
| Share page is unauthenticated and read-only | `SharePublic` screen calls `GET /shared/:token` with no token |
| Report export via browser print | Not offered (D3); the Report screen is in-app only |

## 5. Files touched (ownership map)

| Area | Files |
|---|---|
| Navigation | `mobile/App.js` (single owner, Phase 1 and 5) |
| Shared logic | `mobile/src/lib/*.js` (new), `mobile/src/api/client.js` |
| UI kit | `mobile/src/ui.js`, `mobile/src/theme.js`, `mobile/src/prefs.jsx` (new) |
| Components | `mobile/src/components/*.js` (new) |
| Screens | `mobile/src/screens/*.js` (rewrite Group; edit Home, AddExpense, ExpenseDetail, Settlement, Pay, Profile, System, Auth, NewGroup; new Settings, SharePublic, Verify, Statement, Report, People, Recurring, Categories, GroupSettings) |
| Config | `mobile/package.json`, `mobile/app.json` (plugins/permissions), `mobile/scripts/sync-i18n.js`, `mobile/scripts/mapping-check.js` |
| API (if D1/D2 approved) | `api/Endpoints/LedgerEndpoints.cs` or new `api/Endpoints/ActivityEndpoints.cs`, `api/Endpoints/AuthEndpoints.cs` (devices) or new `api/Endpoints/DeviceEndpoints.cs`, `api/Notifications/ExpoPushProvider.cs`, `api/Models/PushDevice.cs`, `api/Data/AppDbContext.cs`, `api/Migrations/*`, `api/Program.cs` (provider switch), `tests/ActivityFeedTests.cs`, `tests/PushDeviceTests.cs` |
| Docs | `README.md` (mobile parity section), `mobile/README.md` (rewrite mapping table), `specs/005-mobile-parity/*` |

No web source changes are required. If D1 lands, web may later swap its 2×N
fan-out for one call (separate change, not in scope).

## 6. Verification strategy

**Per phase**
1. `npm --prefix mobile test` — mapping check (extended) + `node --test mobile/test/*.test.cjs`
   for pure modules (money, ledger query, activity paging, receipt cards, quick-add, i18n keys).
2. `npm --prefix web build` + `node --test web/test/*.mjs` — prove web untouched.
3. `dotnet test tests/SplitShare.Tests.csproj` — when API changes land (requires
   task 0.0 first: the test project does not compile at HEAD).
4. Manual device matrix (iOS simulator + Android emulator): signed-out deep
   links, sign-in, group open, add expense (all 4 split types + extras), scan
   single/batch, payment + reverse, statement, report screen, invite, offline
   draft → reconnect, language switch, push permission (Expo Go limits noted).

**Parity evidence**: one row per matrix entry exercised end-to-end against the
same seeded group used for web screenshots; amounts compared field by field.

**Baseline before starting** (measured 2026-10-25, no code changed):
`node --test web/test/*.mjs` → 124 pass; `npm --prefix mobile test` → mapping
check pass; `dotnet test tests/SplitShare.Tests.csproj` → **does not compile**
(`tests/OcrTests.cs` references the removed `ReceiptTextParser`/`ReceiptSummary`).
That is pre-existing and unrelated to mobile, but it must be fixed (task 0.0)
before API additions can be verified.

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Google OAuth needs per-platform client IDs (iOS/Android/web) and a dev build for native flow | Configure `expo-auth-session` + `extra.googleClientId` per platform; document the redirect URI; keep web fallback via `expo-web-browser`; token paste stays as last-resort dev path |
| i18n refactor touches every screen (large diff, merge risk) | Land `prefs.jsx` + message catalogue + key-drift test in Phase 0, then convert screens phase by phase; a grep-based test fails any new hardcoded string in `screens/` |
| Batch scan on Android memory (10 × 12 MP images) | Cap long edge at 1600 px before scan, release card files after creation, sequential uploads, `ImageManipulator` in-memory |
| Push cannot be tested in Expo Go on newer SDKs / requires EAS | Verify at least local notification delivery + server `ExpoPushProvider` unit test; document the dev-build step |
| 100-item ledger without pagination | Match web (`limit=100`) + "showing newest 100" hint; add "load older" only if API paging is exposed to users (web hides it too) |
| Currency invariants regress again | Single `lib/money.js` + test asserting no cross-currency arithmetic in display helpers |
| Big-bang mobile release | Phases are independently shippable; each ends with the app usable (no half-built screen) |

## 8. Rollout

1. Phase 0–1 build (foundations, Home, Groups, Quick add, New group) — internal build.
2. Phase 2–3 (group, expense, payment, activity) — beta with the team group.
3. Phase 4 (report, statement, recurring) + Phase 5 (account, links, push) — store build.
4. API additions ship before the app build that uses them; mobile falls back when
   `GET /capabilities` lacks `features.activity_feed` / `push_devices`.
