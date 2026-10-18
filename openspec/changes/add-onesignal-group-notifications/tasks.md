## 1. API: notification provider abstraction
- [x] 1.1 `api/Notifications/NotificationProvider.cs`: `NotificationMessage` record + `INotificationProvider` interface (`SendToUsersAsync(userIds, message, ct)`)
- [x] 1.2 `api/Notifications/NullNotificationProvider.cs`: log-only no-op implementation
- [x] 1.3 `api/Notifications/OneSignalProvider.cs`: named-HttpClient send to `https://api.onesignal.com/notifications` with `Authorization: Key`, `app_id`, `target_channel: push`, `include_aliases.external_id`, `headings`/`contents`/`url`/`data.group_id`; log non-2xx; never log secrets
- [x] 1.4 `api/Notifications/NotificationProviderFactory.cs`: `Notification:Provider` → null|onesignal, unknown → `InvalidOperationException` (mirror `DatabaseProviderFactory`)
- [x] 1.5 `api/Program.cs`: register `AddHttpClient("onesignal")` + singleton `INotificationProvider` from factory

## 2. API: group-event fan-out
- [x] 2.1 `ExpenseService.CreateAsync`: after `SaveChangesAsync`, best-effort notify group members minus actor (title "X added an expense", body title+amount, url → group); `try/catch` + timeout; optional ctor param so existing tests compile
- [x] 2.2 `PaymentService.RecordAsync`: same fan-out with payment wording
- [x] 2.3 Config plumbing: `docker-compose.yml` `Notification__*` envs, `.env.example` placeholders

## 3. Web: OneSignal SDK subscription
- [x] 3.1 `web/public/OneSignalSDKWorker.js` (one-line importScripts)
- [x] 3.2 `web/index.html`: SDK v16 script tag + deferred init scaffold; `web/src/main.jsx` (or module) `OneSignal.init({ appId, allowLocalhostAsSecureOrigin: DEV })`
- [x] 3.3 `web/src/auth.jsx`: `OneSignal.login(user.user_id)` on user set, `OneSignal.logout()` on logout; guard when no App ID configured
- [x] 3.4 `web/src/pages/Settings.jsx`: Notifications section — permission state + "Enable notifications" button (`requestPermission`), no auto-prompt
- [x] 3.5 `VITE_ONESIGNAL_APP_ID` plumbing: `web/Dockerfile`, docker-compose web service, `.github/workflows/cd-web.yml` + `ci-web.yml`, `apphost/Program.cs`

## 4. Tests
- [x] 4.1 `tests/NotificationTests.cs`: recording fake provider; expense fan-out targets all members except actor (content asserts); payment fan-out likewise; provider exception does not fail creation; two-member group → only other member targeted
- [x] 4.2 Factory tests (mirror `tests/ProviderTests.cs`): unset → null provider, `onesignal` → `OneSignalProvider`, unknown → throws

## 5. Verification
- [x] 5.1 `dotnet test`: all new + existing tests green; `npm run build` in `web/` green
- [ ] 5.2 E2E (requires REST API Key in `.env`): run api+web on localhost:3000, dashboard Site URL = localhost + "treat HTTP localhost as HTTPS"; subscribe via Settings button; confirm Subscribed row in OneSignal dashboard; create expense as user A (Chrome) → user B (second browser, logged in, subscribed) receives push; confirm no self-notification for A; record payment → same; verify message stats in Messages > All messages; optional direct curl with REST key + external_id

## Verification Notes
- api/SplitShare.Api.csproj builds with 0 errors; provider module (interface/null/onesignal/factory), GroupNotifier fan-out, ExpenseService+PaymentService hooks, DI registration, docker-compose + .env.example config plumbing all in place.
- OneSignalSDKWorker.js in web/public; SDK v16 script in index.html + initOneSignal in main.jsx via web/src/onesignal.js wrapper (no-op without VITE_ONESIGNAL_APP_ID, allowLocalhostAsSecureOrigin in DEV); login/logout external-id hooks in auth.jsx; Notifications tab with explicit Enable button in Settings.jsx (no auto-prompt); VITE_ONESIGNAL_APP_ID plumbed through Dockerfile, docker-compose, ci/cd workflows, apphost. npm run build green.
- tests/NotificationTests.cs adds 6 tests (expense fan-out excludes actor + content asserts; payment fan-out; two-member group; provider-throw does not fail money ops; single-member group sends nothing; factory selection/unknown-throws). dotnet test: 62/62 pass (56 existing green + 6 new). npm run build green.
