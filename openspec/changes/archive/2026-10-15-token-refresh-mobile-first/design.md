## Context

`web/src/api.js` attaches the access token and throws on 401 with no recovery; `AuthProvider` boot clears tokens on any `/me` failure. Backend `POST /auth/refresh` rotates correctly. UI is Mantine with some responsive props; tables, participant rows, segmented controls, and modals are desktop-sized.

## Goals / Non-Goals

**Goals:**
- One-place refresh (inside `req()`), invisible to all callers.
- Mobile-first fluid CSS: base = small screens, scale up via Mantine breakpoints.

**Non-Goals:**
- Proactive timers, expiry copy, separate mobile layouts, API changes.

## Decisions

1. **Module-level refresh promise** in `api.js`: first 401 creates it, concurrent 401s await it, settled promise clears itself (success stores pair, failure clears tokens). Retry exactly once per request (`_retried` flag) to bound loops.
2. **Auth-path guard**: any path starting `/api/v1/auth/` throws 401s untouched — login failures must never mint refresh traffic.
3. **Refresh failure contract**: clear both tokens, throw a distinct `SESSION_EXPIRED`-coded error so a future notice can hook in; `Guard` behavior unchanged (`/login`).
4. **Tables**: wrap Mantine `Table` in `ScrollArea` with `min-width` on the table; keep striped rows. Card-ify only if scroll still feels wrong at 360px (decide at verification).
5. **Participant rows**: `Stack` per row on base (checkbox+name line, `TextInput` full width below), side-by-side from sm up via `Group` + responsive `hiddenFrom`/`visibleFrom` or CSS. Split-type `SegmentedControl` gets horizontal scroll (`ScrollArea` + `white-space: nowrap` equivalent via `style={{ overflowX: 'auto' }}`) or 2×2 — pick at implementation by whichever keeps labels untruncated.
6. **Modals**: `fullScreen` on small screens — Mantine `Modal fullScreen="<sm"`? Mantine supports boolean or breakpoint string in newer versions; fallback is `size="100%"` under sm via `useMediaQuery`. Verify against installed Mantine version.

## Risks / Trade-offs

- Retry-once could mask a genuinely revoked session for one extra round trip; negligible.
- `localStorage` token races across tabs (logout in tab A while tab B refreshes): B's refresh fails → B logs out too. Correct behavior.
- Sticky first table column skipped unless scroll proves insufficient.
