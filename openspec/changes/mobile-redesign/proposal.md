---
slug: "mobile-redesign"
createdAt: "2026-10-15T20:48:14.000Z"
---

## Why

On a 360–390px phone the group detail page (screenshot, "colorado" group) breaks in five places: (1) the app header overflows — "UNVERIFI…", "Prof", "Log c" are truncated; (2) five secondary actions (Statement/Report/Export CSV/Settings/Share link) consume two full rows of large buttons; (3) seven tabs wrap into three ragged rows (Ledger/Balances/Total paid / Total share/Payments/Activity / Recurring); (4) the ledger table (`miw={640}`) forces sideways scrolling for the core content; (5) member rows stack up to three buttons (Paid/Treasurer/Remove) that overflow. The page is usable but not thumb-friendly, and every new trip-pack feature made it worse. Token-refresh work already established the mobile patterns (fullscreen modals, 44px targets, horizontal table scroll as stopgap) — this change finishes the job: no page-level horizontal scroll, no truncation, primary actions in the thumb zone.

## What Changes

- **App header** (`Shell.jsx`): under `sm`, collapse to brand + avatar-triggered Menu (Profile, Log out, verification nudge). Full button row stays on desktop.
- **Secondary actions** (GroupDetail header): Statement/Report/Export/Settings/Share link/flat-fee move into one "More" Menu (bottom-sheet style on mobile via `Menu` + fullscreen modal fallback). Header keeps title, badges, net, budget bar.
- **Tab rail**: 7 tabs become a single horizontally scrollable snap rail (`overflow-x:auto`, `white-space:nowrap`, edge fade), never wrapping. Same `Tabs` state — CSS + wrapper only.
- **Ledger → cards on mobile**: new shared `LedgerList` renderer — stacked expense/payment cards under `sm` (title, payer→parties, amount + my share, status chip, copy/edit icons), existing table on `sm+` (Mantine `hiddenFrom`/`visibleFrom`). Same data, no API change.
- **Sticky action bar**: Record payment / + Expense dock to a bottom sticky bar on mobile (safe-area padding), inline buttons stay on desktop.
- **Collapsible filter shelf**: ledger filters hide behind a "Filters (n)" disclosure on mobile showing active-filter count; always visible on desktop.
- **Member rows**: Paid/Treasurer/Remove collapse into a per-row Menu on mobile.
- **Expense form sections**: Basics / Bill details (tax/tip/fee/FX/guests) / Split as collapsibles with sticky Save on mobile; unchanged on desktop.
- **Tables elsewhere** (paid/share/statement/report/breakdown/share page): reuse the card-list pattern via one shared component.

## Capabilities

### New Capabilities
- `mobile-redesign/responsive-shell`: compact header, overflow menus, scroll-snap tab rail, sticky action bar, collapsible filters

### Modified Capabilities
- `splitshare-v1/ledger-views`: presentation only — card renderer alongside table, same endpoints
- `intuitive-ux-pass/discoverability`: tap-card pattern extended to ledger/member rows (amends, does not contradict)

## Impact

- Code: `web/src/components/Shell.jsx`, `GroupDetail.jsx`, `Forms.jsx`, `ExpenseDetail.jsx`, new `components/Mobile.jsx` (tab rail, overflow menu, card lists, sticky bar), `styles.css` (scroll-snap, safe-area). No API change.
- Out of scope: native apps, push, changing tab destinations or information architecture, desktop restyle (desktop must look identical).
- Acceptance: 360px — zero page-level horizontal scroll, zero truncated controls, all 7 tabs reachable by swipe, primary actions visible without scrolling past content; laptop — pixel-identical to today.
