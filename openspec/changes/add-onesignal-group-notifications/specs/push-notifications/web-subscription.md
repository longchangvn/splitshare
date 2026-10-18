## Purpose

Web browsers subscribe to push through the OneSignal Web SDK, identified as the logged-in SplitShare user so the API can target them by user GUID — no device-token table required.

## ADDED Requirements

### Requirement: Web SDK initialization
The web app loads OneSignal Web SDK v16 via script tag and initializes with `appId` from `VITE_ONESIGNAL_APP_ID`; `allowLocalhostAsSecureOrigin` is enabled in development so localhost:3000 can be subscribed and tested. `OneSignalSDKWorker.js` is served from the web root and returns `application/javascript`.

#### Scenario: SDK boots with the app
- **WHEN** the web app loads with `VITE_ONESIGNAL_APP_ID` set
- **THEN** OneSignal initializes without errors and the service worker registers on the app origin

### Requirement: Identify the logged-in user
On authentication, the client calls `OneSignal.login(user.user_id)`; on logout it calls `OneSignal.logout()`, so notifications stop targeting a signed-out browser and a different account on the same browser is never mis-delivered.

#### Scenario: Login links the subscription
- **WHEN** a user logs in (or a persisted session restores)
- **THEN** their browser's OneSignal subscriptions are associated with their `user_id` (external ID)

#### Scenario: Logout unlinks
- **WHEN** the user logs out
- **THEN** the external ID is cleared from the browser's subscriptions

### Requirement: Explicit notification opt-in
The browser permission prompt is requested only from an explicit user action — an "Enable notifications" control in Settings showing current state — never automatically on load or login.

#### Scenario: User enables notifications
- **WHEN** the user clicks "Enable notifications" in Settings and accepts the browser prompt
- **THEN** the browser subscription becomes Subscribed (visible in the OneSignal dashboard) and the control reflects the enabled state

#### Scenario: No automatic prompting
- **WHEN** a user logs in without interacting with the Settings control
- **THEN** no browser permission prompt appears
