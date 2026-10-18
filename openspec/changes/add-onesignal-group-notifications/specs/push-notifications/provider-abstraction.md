## Purpose

Abstract push-notification provider interface so the delivery vendor (OneSignal today) can be swapped without touching call sites, mirroring the existing `IDatabaseProvider` / `IEmailSender` switchable-provider patterns.

## ADDED Requirements

### Requirement: Notification provider abstraction
The API exposes `INotificationProvider.SendToUsersAsync(userIds, message, ct)` taking a `NotificationMessage { Title, Body, Url }` and a list of user GUIDs. Implementations: `OneSignalProvider` (HTTP `POST https://api.onesignal.com/notifications` with `Authorization: Key <rest-key>`, `app_id`, `target_channel: "push"`, `include_aliases: { external_id: [<guids>] }`, `headings`/`contents`/`url`) and `NullNotificationProvider` (logs, no-op). The concrete provider is chosen by `Notification:Provider` config via `NotificationProviderFactory`; empty/unset → `NullNotificationProvider`; unknown value → startup error. App ID and REST API key come from `Notification:OneSignal:AppId` / `Notification:OneSignal:ApiKey` and are never logged or committed.

#### Scenario: No provider configured
- **WHEN** `Notification:Provider` is unset
- **THEN** the app boots with `NullNotificationProvider` and notification sends are logged no-ops

#### Scenario: OneSignal selected
- **WHEN** `Notification:Provider=onesignal` with App ID and REST key set
- **THEN** sends produce a valid OneSignal create-notification request targeting the given external IDs

#### Scenario: Unknown provider rejected
- **WHEN** `Notification:Provider` is set to an unrecognized value
- **THEN** startup fails with a clear error (same behavior as `DatabaseProviderFactory`)

### Requirement: Swappable without call-site changes
Replacing OneSignal with another vendor requires only a new `INotificationProvider` implementation and one factory entry; expense/payment services and endpoints are unchanged.

#### Scenario: Third provider added
- **WHEN** a new provider class + factory line is added
- **THEN** existing call sites and tests compile and pass unmodified
