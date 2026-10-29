# SplitShare Mobile (Expo) — web parity

Scope: **all web functionality except the accepted gaps below** (spec
`specs/005-mobile-parity/`). Behaviour matches the web client: same endpoints,
same payloads, same money rules and the same permission model.

## Run

```sh
# 1) API on :8081 (Expo Metro uses :8082 so they do not collide)
dotnet run --project api --urls http://localhost:8081

# 2) Mobile
cd mobile
npm install
npm start            # then i (iOS simulator) or a (Android emulator)
```

API URL: `app.json` `extra.apiUrl` (default `http://localhost:8081`). On a
physical device the client rewrites loopback to the Metro LAN IP; the Android
emulator uses `10.0.2.2`.

## Screen map (web route → mobile screen → endpoints)

| Web | Mobile | Endpoints |
|---|---|---|
| `/` Dashboard | `screens/HomeScreen.js` | `GET /me/balances` (cached), `GET /me/activity` (3 rows), `GET /capabilities` |
| `/groups` | `screens/GroupScreen.js` (`GroupsScreen`) | `GET /me/balances` |
| `/groups/:id` Group | `screens/GroupScreen.js` (`GroupDetailScreen`) | `GET /groups/:id`, `/me`, `/summary`, `/settlement`, `/categories`, `/ledger?…` |
| Quick add modal | `screens/QuickAdd.js` | `GET /contacts`, `POST /groups`, then Add expense |
| New group wizard | `screens/NewGroupScreen.js` | `POST /groups`, `POST /groups/from-template`, `/invites`, `/members` |
| Add / edit expense | `screens/AddExpenseScreen.js` + `components/ExpenseForm.js` | `POST /groups/:id/expenses` (`Idempotency-Key`), `POST …/preview-split`, `PATCH /expenses/:id` + `expected_version`, `POST /expenses/:id/preview-edit`, `POST /expenses/:id/images` |
| Receipt scan | `components/ExpenseForm.js` (single), `components/ScanReceipts.js` (≤10) | `POST /groups/:id/expenses/scan`, `POST /groups/:id/expenses` per card |
| Expense detail | `screens/ExpenseDetailScreen.js` + `components/Comments.js` | `GET/PATCH/DELETE /expenses/:id`, `GET /images/:id` (authed), `GET/POST /expenses/:id/comments`, `DELETE /comments/:id` |
| Pay | `screens/PayScreen.js` + `components/PaymentForm.js` | `POST /groups/:id/payments`, `GET /users/:id/handles`, `POST /payments/:id/reverse` |
| Settlement | `screens/SettlementScreen.js` | `GET /settlement`, `/settlement/history`, ledger `type=payment`, `POST /payments/:id/reverse` |
| Statement | `screens/Statement.js` | `GET /groups/:id/statement/:uid` |
| Report | `screens/Report.js` | `GET /summary`, `/breakdown`, `/settlement`, `/categories` |
| Group activity | `screens/GroupActivity.js` | `GET /activity`, ledger payments, reverse |
| `/activity` | `screens/SystemScreen.js` | `GET /me/activity` (paged), fan-out fallback, offline queue, push |
| Group settings | `screens/GroupSettings.js` | `PATCH /groups/:id`, `/status`, `POST /share-link`, `/leave`, `DELETE /groups/:id` |
| Categories | `screens/Categories.js` | `GET/POST/PATCH/DELETE /groups/:id/categories` |
| Recurring | `screens/Recurring.js` | `GET/POST/PATCH/DELETE /groups/:id/recurring` |
| Invite hub | `components/InviteSheet.js` | `POST /invites`, `/members`, `/rotate-invite`, clipboard + share sheet |
| People | `components/PeopleTab.js` | `PATCH /members/:uid` (role), `/deposit`, `DELETE /members/:uid` |
| Balances | `components/BalancesTab.js` | settlement transfers, `POST /nudges` |
| `/profile` | `screens/ProfileScreen.js` | `/me`, `/me/password`, `/me/handles`, `DELETE /me` |
| `/settings` | `screens/Settings.js` | local template catalogue (`lib/templates.js`) |
| `/s/:token` | `screens/PublicScreens.js` (`SharePublicScreen`) | `GET /shared/:token` (no session) |
| `/g/:token` | `screens/PublicScreens.js` (`InviteLandingScreen`) | `GET /invites/:token`, `POST /groups/join` |
| Auth pages | `screens/AuthScreen.js` | `/auth/login/register/google/forgot/reset/verify-email`, biometric unlock |

Shared modules:

- `lib/money.js` — web-identical `fmt`, sign/tone, amount validation, and
  per-currency balance building (currencies are **never** summed).
- `lib/errors.js` — API code → localized message, field errors, network vs HTTP.
- `lib/expensePayload.js` / `lib/ledger.js` / `lib/activity.js` /
  `lib/receipts.js` / `lib/receiptScan.js` / `lib/quickAdd.js` /
  `lib/breakdown.js` — pure ports of the web helpers, unit-tested.
- `i18n/messages.js` — **generated** from `web/src/i18n/messages.js`
  (`npm run sync:i18n`); `i18n/extra.js` holds mobile-only copy.
- `prefs.jsx` — EN/VI locale persisted in AsyncStorage.
- `cache/store.js` — last-good response cache used by Home/Groups (stale chip).
- `push/notifications.js` — Expo token registration (`POST /me/devices`),
  per-group mute (`PATCH /me/devices/:id`), delete on logout, tap routing.

## Accepted gaps (deliberate, approved)

- **G-1 Export** (PDF/CSV) stays web-only; the mobile Report screen shows no
  export control.
- **G-2 Theme** — light palette only; language switch is EN/VI.
- **G-3 Group navigation** — Expenses · Balances are tabs; Activity, Statement,
  Report, People, Recurring, Categories, Invite and Settings live in one `⋯`
  sheet so nothing is more than three taps away.
- Receipt OCR pre-processing skips the web's grayscale stretch (no canvas in
  React Native); photos are still downscaled to 1200 px and re-encoded at 60 %.

## Backend quirks honoured

- Preview-split is group-scoped: `POST /groups/:id/expenses/preview-split`.
- Un-settle preview for edits: `POST /expenses/:id/preview-edit` → blocking
  confirm sheet before `PATCH` with `expected_version`.
- Images are authenticated: the app passes an `Authorization` header on the
  `Image` source (`imageSource()`), never an unauthenticated URL.
- `Idempotency-Key` is optional server-side; the client always sends it on
  expenses/payments and reuses the SAME key for offline retries.
- `GET /me/activity` and `POST /me/devices` are new (spec 005 D1/D2); older API
  builds fall back to per-group fan-out and local-only mute.

## Verify

```sh
npm test          # mapping check + 54 unit tests (money, payloads, receipts, i18n,
                  #   JSX parse of every file, App routing/deep-link wiring)
npm run sync:i18n -- --check   # mobile copy matches the web catalogue
```

Deep links: `npx uri-scheme open splitshare://groups/<id> --ios`.
