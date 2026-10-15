## Context

Group rows link only on the name text; loading is blank sections or static text except auth boot and create-group; dashboard is flat cards + hidden modal. Mantine v7 with Skeleton, Loader, ChevronRight icon availability to verify at implementation.

## Goals / Non-Goals

**Goals:**
- One interaction pattern for tappable cards; one skeleton pattern reused across screens.
- Zero layout shift between skeleton and content frames.

**Non-Goals:**
- Join-via-link box, API changes, native apps.

## Decisions

1. **Whole-card navigation via click handler + chevron**, not nested links: card `onClick` navigates, inner elements get `pointer-events` care so text selection still works; `tabIndex={0}` + key handler + `:focus-visible` ring; hover lift via Mantine `withBorder` + CSS transform (mobile-first: no hover dependency — chevron is always visible).
2. **Skeletons over spinners for page loads** (shape-matched: `Skeleton` rows mirroring cards/tables), `Loader` overlay only for in-place refetches like ledger tab changes.
3. **Button loading as double-submit guard**: every mutation button gets `loading` state tied to its request promise; form submits early-return while pending.
4. **Dashboard boxes**: `Title order={4}` + icon per box (Balances 💰, Groups 👥, Quick actions ⚡ — emoji or Tabler icons matching existing style), each in its own `Card` container.

## Risks / Trade-offs

- Whole-card click vs text selection on desktop: mitigate by keeping the name selectable via muzzling only non-text zones... simpler: keep inner Anchor for a11y name, card click handles the rest; screen-reader label announces "View group details".
- Skeleton/content frame mismatch causes layout jump; mitigate by fixing skeleton heights to measured content rows.
