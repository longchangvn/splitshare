---
slug: "add-onesignal-group-notifications"
createdAt: "2026-10-17T23:00:00.000Z"
---

## Why

SplitShare has no push notifications: when a member adds an expense or records a payment, other group members only find out next time they open the app. This change adds real-time push notifications for those events, delivered through OneSignal (App ID `95038e0d-3c11-4469-8ee4-e1580d4d0edd`), behind an abstract provider interface so the push vendor can be swapped later — the same "switchable provider" pattern already used for the dual database providers and `IEmailSender`.

## What Changes

- **API**: new `api/Notifications/` module with `INotificationProvider` (the abstraction), `NotificationMessage` (title/body/url), `OneSignalProvider` (sends via OneSignal REST API `POST /notifications`, targeting users by `include_aliases.external_id` = user GUID), `NullNotificationProvider` (default no-op), and a config-driven `NotificationProviderFactory` (`Notification:Provider` = `null` | `onesignal`).
- **Fan-out**: creating an expense (`ExpenseService.CreateAsync`) or recording a payment (`PaymentService.RecordAsync`) fires a best-effort, fire-and-forget notification to all current group members **except the actor**. A provider failure never fails the money operation (same discipline as the existing budget-alert email).
- **Web**: OneSignal Web SDK v16 — `OneSignalSDKWorker.js` service worker in `web/public/`, SDK init (App ID + `allowLocalhostAsSecureOrigin` for dev), `OneSignal.login(user.user_id)` / `OneSignal.logout()` tied to the existing `AuthProvider`, and an explicit **Enable notifications** button in Settings (no auto-prompt).
- **Config**: `Notification__Provider`, `Notification__OneSignal__AppId`, `Notification__OneSignal__ApiKey` (REST key, from `.env`) in docker-compose; `VITE_ONESIGNAL_APP_ID` in web build args/workflows.

## Capabilities

### New Capabilities
- `push-notifications/provider-abstraction`: abstract notification provider interface + config-driven factory (OneSignal + null implementations)
- `push-notifications/group-events`: expense-created and payment-recorded events notify all group members except the actor
- `push-notifications/web-subscription`: web SDK init, service worker, external-id login, explicit opt-in button

### Modified Capabilities
(none — additive; no existing requirement-level behavior changes)

## Impact

- Code: new `api/Notifications/*`; edits to `api/Expenses/ExpenseService.cs`, `api/Payments/PaymentService.cs`, `api/Program.cs`; web: `web/public/OneSignalSDKWorker.js`, `web/index.html`, `web/src/main.jsx`, `web/src/auth.jsx`, `web/src/pages/Settings.jsx`; env plumbing in `docker-compose.yml`, `.env.example`, `web/Dockerfile`, `.github/workflows/cd-web.yml`, `apphost/Program.cs`.
- Dependencies: none new on the API (plain `HttpClient`); web stays script-tag based (no npm dep).
- Secrets: OneSignal **REST API Key** lives in `.env` / CI secrets only, never committed.
- Out of scope: mobile/Expo push (Expo SDK 52 < required 53+, Expo Go can't receive push, no APNs/FCM credentials — deferred to a follow-up change), notification history/persistence, in-app notification center, per-user/group notification preferences (beyond browser-level blocking), email changes.
