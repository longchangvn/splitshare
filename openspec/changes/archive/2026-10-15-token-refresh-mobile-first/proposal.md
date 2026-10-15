---
slug: "token-refresh-mobile-first"
createdAt: "2026-10-15T00:43:01.000Z"
---

## Why

Users are logged out every 15 minutes when the access token lapses, even though a valid 30-day refresh token sits unused — the web client never calls `POST /auth/refresh`. Separately, the UI was built desktop-first and cramps at phone widths (ledger tables, inline split inputs, modals).

## What Changes

- Web `api.js`: on 401 from non-auth endpoints, single-flight refresh via stored refresh token, store the rotated pair, retry the original request once; refresh failure still logs out. No timers, no spinners.
- Web UI mobile-first fluid pass: tables get horizontal scroll (card-ify only if still wrong at 360px), expense participant rows stack with full-width inputs, split-type selector adapts under sm, modals go fullScreen on small screens, 44px touch targets, no fixed-width layouts.

## Capabilities

### New Capabilities
- `token-refresh`: transparent reactive refresh with concurrency dedupe in the web client

### Modified Capabilities
- `splitshare-v1/ledger-views`: responsive presentation only, no contract change
- `splitshare-v1/expenses`: responsive form presentation only, no contract change

## Impact

- Code: `web/src/api.js`, responsive tweaks in pages/components + `styles.css`. No API change (refresh endpoint already rotates correctly).
- Out of scope: proactive refresh timers, session-expired copy, native mobile apps, server-side copy endpoint.
