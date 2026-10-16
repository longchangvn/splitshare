# SplitShare Mobile (Expo Managed) — 1:1 with `docs/mobile-design.html`

Scope per approval: **8 screens only** (not the trip-pack superset), online-first
V1 with push/offline **stubbed**, auth wiring **as proposed** (SecureStore +
Bearer + single-flight refresh).

## Run

```sh
cd mobile
npm install
npx expo start
# API URL: app.json extra.apiUrl (default http://localhost:8081)
```

Deep link test: `npx uri-scheme open splitshare://g/<token> --ios`.

## 1:1 mapping (frame → file → endpoints)

| Frame | Screen file | Endpoints (verified by `npm test`) |
|---|---|---|
| 1 Auth | `src/screens/AuthScreen.js` (+Register/Forgot) | `POST /auth/login`, `/auth/google` (TODO native ID-token), `/auth/forgot`, `/auth/register` |
| 2 Home | `src/screens/HomeScreen.js` | `GET /me/balances` grouped by currency, never summed; `>30d` flag TODO from detail |
| 3 Group ledger | `src/screens/GroupScreen.js` (`GroupsScreen`+`GroupDetailScreen`) | `GET /groups/:id`, `/groups/:id/me`, `/groups/:id/ledger?…` + seg Ledger/Settle/Members/Photos |
| 4 Add expense | `src/screens/AddExpenseScreen.js` | `POST /groups/:id/expenses/preview-split` (group-scoped!), `POST /groups/:id/expenses` + `Idempotency-Key`, `POST /expenses/:id/images` (≤5, ≤10MB) |
| 5 Settlement | `src/screens/SettlementScreen.js` | `GET /groups/:id/settlement`, `/settlement/history`; WHY? `aria-expanded`; Pay › → Pay screen |
| 6 Pay + guard | `src/screens/PayScreen.js` | `POST /groups/:id/payments` + `Idempotency-Key`; 422 OVERPAYMENT; blocking bottom-sheet on `unsettled_*`; 403 LOCKED |
| 7 New group | `src/screens/NewGroupScreen.js` | `POST /groups`, `GET /contacts`, `POST /groups/:id/members`, `/invites`, copy/share link, `POST /groups/join` (Join screen in `App.js`) |
| 8 System | `src/screens/SystemScreen.js` | `GET/PATCH/DELETE /me` (422 `HAS_OPEN_BALANCE`), `PATCH /me/password`; queue/push stubs |
| Tabs + links | `App.js` | `Home·Groups·Add·Activity·You`; `splitshare://g/<token>` + `https://app/g/<token>` → Join (410 `INVITE_ROTATED`) |

Shared: `src/api/client.js` (SecureStore `ss_at/ss_rt`, single-flight refresh,
`ApiError{code,message,fields}`, `newIdempotencyKey()`, authed `getBlob`),
`src/auth/AuthContext.js` (Guard equivalent), `src/theme.js` (teal tokens),
`src/offline/queue.js` + `src/push/notifications.js` (stubs).

## Deliberate deviations (design text vs backend truth)

- Frame 4 says "signed URL 15-min" and "`POST /expenses/preview-split`":
  backend has **neither** — use authed `GET /images/:id` and **group-scoped**
  `POST /groups/:id/expenses/preview-split` (+ `POST /expenses/:id/preview-edit`
  for the un-settle modal). Code does this.
- Frame 6 `amount_cents` vs backend `amount` decimal: client sends `amount`
  (server shape), displays cents-converted.
- `Idempotency-Key` "required" (spec) is optional server-side; client always sends.
- Trip-pack superset (budgets/templates/recurring/handles/comments/nudges/
  statement/report/breakdown/share-link) is **out of scope** per approval.

## TODO (V1-next, stubbed)

1. Google native ID-token (`expo-auth-session`) → `POST /auth/google`.
2. Biometric unlock: store credentials in SecureStore on first login.
3. Offline queue: persist drafts (AsyncStorage) + drain with **same** key.
4. Push: `expo-notifications` token register + per-group opt-out + owed badge.
5. Camera compress (ImageManipulator) before upload; member pickers (payer/
   participants/from); `preview-edit` un-settle check on expense edit.
