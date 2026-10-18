## Context

Stack: React + Mantine v7, breakpoint `sm` = 36em (existing `isMobile` hook at `(max-width: 36em)`). Mantine `Tabs.List` wraps by default; `Menu` renders a dropdown (not a sheet) — bottom-sheet feel comes from fullscreen `Modal`. GroupDetail currently has 7 tabs and 5+ header actions, all added during trip-pack. Screenshot proves the breakage at ~390px.

## Goals / Non-Goals

**Goals:** one-thumb operation of ledger/balances/pay at 360px; zero new API; desktop unchanged.
**Non-Goals:** IA changes (no tab merging/renaming), native code, altering desktop CSS.

## Decisions

1. **CSS-first tab rail, not a tab picker**: wrap `Tabs.List` in `.tab-rail { overflow-x: auto; scroll-snap-type: x proximity; }` with `white-space: nowrap` on tabs + trailing fade mask. Keeps every destination one tap away and preserves `Tabs` state/keyboard behavior. A "More" dropdown would hide destinations and need new state.
2. **Mantine `Menu` for overflow, not custom sheets**: header actions → one `Menu` ("More") with `position="bottom-end"`; on mobile trigger it full-width. No new dependency; a11y (focus trap, Escape) comes free. True bottom sheets need `vaul` — rejected (new dep, marginal gain).
3. **Dual-render lists via `hiddenFrom`/`visibleFrom`**: `LedgerList` renders cards (`hiddenFrom="sm"`) + table (`visibleFrom="sm"`) from the same `items` array. Duplicated JSX, zero branching logic, no resize listeners, no hydration risk.
4. **Sticky bar only for the two money actions**: Record payment / + Expense get `position: sticky; bottom: 0; padding-bottom: env(safe-area-inset-bottom)` under `sm`. Secondary actions stay in the overflow menu — sticky bars with >2 actions become tap-target soup.
5. **Filter shelf with count badge**: `Filters (2)` disclosure; count = active non-default filters. Desktop keeps the two-row toolbar untouched (already verified usable at laptop width).
6. **Member row menu**: per-row `Menu` (Mark deposit, Treasurer toggle, Remove) under `sm`; inline buttons stay on desktop. Owner-only items keep their guards — menu items just call the same handlers.
7. **Form sections collapsed by default except Basics**: Bill details and Split start collapsed on mobile only (`defaultValue` keyed off `isMobile`); validation errors auto-expand their section (error summary links scroll to section). Prevents the "lost Save button" problem on long forms.

## Risks / Trade-offs

- Dual-rendered lists double DOM nodes for ≤100 ledger rows — negligible vs image weight; pagination unchanged.
- Scroll-snap tab rail hides off-screen tabs from first glance; mitigated by fade mask + preserving order (Ledger first).
- Sticky bar overlaps content end: add `padding-bottom` spacer to the tab card under `sm`.
- `visibleFrom/hiddenFrom` use CSS only — screen readers get both trees; add `aria-hidden` on the visually hidden tree to avoid duplicate announcements.
