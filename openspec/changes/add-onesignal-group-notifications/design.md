## Context

Backend is .NET 10 minimal APIs (single `SplitShare.Api` project, feature folders, primary-constructor DI, no repositories), EF Core with dual providers (Postgres/SqlServer), raw `IConfiguration` (no `IOptions`), env fed via docker-compose `X__Y` notation. Precedents to mirror: `IDatabaseProvider` + `DatabaseProviderFactory` (`api/Data/Providers/DatabaseProvider.cs` — factory from config, singleton, "third provider = one class + one factory line") and `IEmailSender`/`StubEmailSender` (best-effort side effects in services, `try/catch` so they never fail the main operation — see `CheckBudgetAlertAsync`). Web is Vite 5 + React 18 SPA, no service worker, `AuthProvider` in `web/src/auth.jsx` already exposes `user.user_id` (GUID) client-side; `index.html` already loads a third-party async script (Google GSI). Mobile is Expo SDK 52 (out of scope here). OneSignal app `95038e0d-3c11-4469-8ee4-e1580d4d0edd` exists; user will supply the REST API Key.

## Goals / Non-Goals

**Goals:** expense/payment events push-notify the rest of the group; vendor-agnostic provider abstraction (`Notification:Provider` switch); zero schema changes; existing tests stay green; fully verifiable locally on localhost:3000.

**Non-Goals:** mobile/Expo push (needs Expo 53+ dev builds + APNs/FCM — follow-up change); notification persistence/history; in-app notification center; per-group/user preference server-side; email changes; SignalR.

## Decisions

1. **Target by external ID — no device-token table.** Web clients call `OneSignal.login(user_guid)`; the API sends one REST request with `include_aliases.external_id = [member GUIDs]` + `target_channel: "push"`. OneSignal resolves subscriptions across web (and later mobile) itself. **Alternative rejected:** storing push tokens in a `user_devices` table + registration endpoint — more code, two DB migrations, token lifecycle management, all of which OneSignal already does.
2. **Interface shape:** `INotificationProvider { Task SendToUsersAsync(IReadOnlyCollection<Guid> userIds, NotificationMessage message, CancellationToken ct = default); }` with `record NotificationMessage(string Title, string Body, string? Url)`. User-ID targeting (not tokens) keeps it vendor-neutral and matches the fan-out use case exactly.
3. **Config-driven factory**, mirroring `DatabaseProviderFactory`: `Notification:Provider` → `"onesignal"` → `OneSignalProvider`; empty → `NullNotificationProvider`; unknown → `InvalidOperationException` at startup. Registered as **singleton** in `Program.cs`; services take the interface as an optional constructor param (`INotificationProvider? notifications = null`) so existing test setups compile unchanged.
4. **OneSignalProvider** uses a named `HttpClient` (`AddHttpClient("onesignal")`, timeout ~10s), `Authorization: Key <key>`, JSON body: `app_id`, `target_channel: "push"`, `include_aliases.external_id`, `headings/en`, `contents/en`, `url`, and `data: { group_id }` for future deep-link handling. Non-2xx or missing-`id` responses are logged (not thrown to callers). Keys read from `Notification:OneSignal:AppId`/`:ApiKey`; never logged.
5. **Hook in services, not endpoints** — after `SaveChangesAsync()` in `ExpenseService.CreateAsync` (next to `CheckBudgetAlertAsync`) and `PaymentService.RecordAsync`. Endpoint-level `Idempotency-Key` replay short-circuits before the service, so replays don't double-send. Recipients = `db.GroupMembers.Where(GroupId == id).Select(UserId)` minus actor.
6. **Best-effort, fire-and-forget:** the send is awaited inside a `try/catch` with a short timeout and logged on failure — same contract as budget-alert emails. Fire-and-forget `Task.Run` was rejected: it risks `DbContext` use after the request scope is disposed (the recipient query needs the scoped `db`). The awaited-but-swallowed call keeps latency bounded (~one REST round trip) and the DbContext valid; a future outbox/queue can replace it behind the same interface.
7. **Web init:** SDK v16 via `<script>` in `index.html` + `OneSignal.init({ appId, allowLocalhostAsSecureOrigin: import.meta.env.DEV })`; `OneSignal.login(user_id)` in `AuthProvider` effect on `user` change, `OneSignal.logout()` in `logout()`. `web/public/OneSignalSDKWorker.js` = one-line `importScripts` (verified servable by nginx `try_files` and Azure SWA config, and served as `application/javascript`).
8. **Explicit opt-in:** a "Notifications" section in `Settings.jsx` reads permission state and offers "Enable notifications" → `OneSignal.Notifications.requestPermission()`. No prompt on load/login (browsers auto-block repeat prompts).
9. **Env plumbing:** API — `Notification__Provider`, `Notification__OneSignal__AppId`, `Notification__OneSignal__ApiKey` in docker-compose + `.env.example` (key value left as placeholder). Web — `VITE_ONESIGNAL_APP_ID` added to `web/Dockerfile` ARG/ENV, docker-compose web service, `cd-web.yml` build, `ci-web.yml` placeholder, and `apphost/Program.cs`.

## Risks / Trade-offs

- **One origin per OneSignal app** (browser same-origin policy): localhost:3000 vs prod domains need separate OneSignal apps or dashboard origin additions; dev uses `allowLocalhostAsSecureOrigin`. Documented in README of the change; test against localhost with the provided App ID configured for localhost.
- **Fire-and-forget loss window:** a crash between commit and send loses the notification (accepted — same as existing email alerts; no retry).
- **REST key in env:** must not be committed; `.env.example` carries a placeholder only; CI uses secrets.
- **External-ID staleness:** a member removed from a group between send and delivery could still receive one in-flight notification — acceptable for this scale.
- **Web push requires HTTPS** except localhost; prod deploys already are HTTPS.
