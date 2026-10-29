# SplitShare Mobile (Expo Managed) — V1 1:1 + UX polish

Scope: **V1 FR-1..FR-11** per `requirements-splitshare.md` + UX polish
(skeletons, spinner buttons, whole-card nav, inline split inputs, copy-expense,
B-proposed action hierarchy). **Trip-pack excluded**
(budgets/templates/handles/comments/recurring/statements/CSV/share-link).

## Run

```sh
# 1) API on :8081 (required — Expo Metro uses :8082 so they do not collide)
dotnet run --project api --urls http://localhost:8081

# 2) Mobile
cd mobile
npm install
npm start          # Expo Metro on :8082
# then press i (iOS simulator) or a (Android emulator)
# or: npm run ios / npm run android
```

API URL: `app.json` `extra.apiUrl` (default `http://localhost:8081`). On a physical
device the client rewrites loopback to the Metro LAN IP; Android emulator uses `10.0.2.2`.

Dev builds (`__DEV__`, i.e. non-release) ignore `extra.apiUrl` and default to
`https://api-container---stage.bravehill-4fe02ad0.southcentralus.azurecontainerapps.io`. Change it at runtime via the
"Developer · API base URL" card on the Login and You screens (persisted in
AsyncStorage; "Reset to default" clears it). Release builds hide the card.

Deep link test: `npx uri-scheme open splitshare://g/<token> --ios`.

## 1:1 mapping (frame → file → endpoints)

| Frame | Screen file | Endpoints |
|---|---|---|
| 1 Auth | `src/screens/AuthScreen.js` (+Register/Forgot/Reset/GoogleToken) | `POST /auth/login/register/google/forgot/reset`, biometric via SecureStore creds |
| 2 Home | `src/screens/HomeScreen.js` | `GET /me/balances` grouped by currency, never summed; `>30d` flag; owed badge |
| 3 Group ledger | `src/screens/GroupScreen.js` | `GET /groups/:id`, `/groups/:id/me`, `/ledger?…&status=`, `/settlement` count, leave/delete/remove/rotate/invites |
| 4 Add expense | `src/screens/AddExpenseScreen.js` | `POST /groups/:id/expenses/preview-split`, `POST /groups/:id/expenses` + `Idempotency-Key`, `POST /expenses/:id/images` (≤5, ≤10MB, compress) |
| 4b Expense detail | `src/screens/ExpenseDetailScreen.js` | `GET/PATCH/DELETE /expenses/:id`, `POST /expenses/:id/preview-edit` (un-settle modal), `409 STALE_VERSION`, `403 EXPENSE_LOCKED` + correction, copy |
| 5 Settlement | `src/screens/SettlementScreen.js` | `GET /groups/:id/settlement`, `/settlement/history`, Why-box (nets/steps/raw/history/completed) |
| 6 Pay + reverse | `src/screens/PayScreen.js` | `POST /groups/:id/payments` + `Idempotency-Key`; `422 OVERPAYMENT`; `POST /payments/:id/reverse` (owner 24h) |
| 7 New group | `src/screens/NewGroupScreen.js` | `POST /groups`, `GET /contacts`, copy/share link, `POST /groups/join` |
| 8a Activity | `src/screens/SystemScreen.js` | offline queue drain, push register + per-group opt-out, settled-lock note |
| 8b You | `src/screens/ProfileScreen.js` | `GET/PATCH/DELETE /me` (`422 HAS_OPEN_BALANCE`), `PATCH /me/password` |
| Tabs + links | `App.js` | `Home·Groups·Add·Activity·You`; `splitshare://g/<token>` + `https://app/g/<token>` → Join (410 `INVITE_ROTATED`) |

Shared: `src/api/client.js` (SecureStore `ss_at/ss_rt`, single-flight refresh,
`ApiError`, `newIdempotencyKey()`, `getBlob`), `src/auth/AuthContext.js`
(biometric stored creds), `src/ui.js` (Skeleton/SpinButton/NetBadge),
`src/offline/queue.js` (AsyncStorage + same-key drain + NetInfo reconnect),
`src/push/notifications.js` (permissions + channel + opt-out + badge).

## Backend quirks honored

- Preview-split is GROUP-SCOPED: `POST /groups/:id/expenses/preview-split`
  (requirements §9 prints `/expenses/preview-split` — backend implements group-scoped).
- Un-settle preview: `POST /expenses/:id/preview-edit` → blocking modal.
- Images: authed `GET /images/:id`; upload `POST /expenses/:id/images` multipart.
- `Idempotency-Key` optional server-side; client always sends on expenses/payments and
  reuses the SAME key for offline retries.

## Verify

```sh
npm test   # mapping-check: all frames → files → endpoint strings
```
