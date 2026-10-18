---
slug: "mobile-simplify"
createdAt: "2026-10-15T20:59:31.000Z"
---

## Why

Mobile-redesign fixed overflow (rail, menus, cards) but the group screen still shows ~30 tappable controls: 7 tabs, a 3-way segmented + search + Go + 8 filter inputs, a full-width "More actions" button, per-row copy/edit/nudge/pay/reverse/pause/delete buttons, manual Refresh buttons, and two stacked cards (Members, Invite) below the fold. It reads as a settings page, not a consumer app. Trip-pack improvement: none of these controls may be deleted by capability — every destination must survive, only the presentation gets quieter. Desktop stays exactly as-is (all changes under `sm`).

## What Changes (mobile only)

- **3 tabs instead of 7**: Expenses | Balances | Activity.
  - Balances absorbs Total paid + Total share as one "Insights" disclosure (same `NameValueList` data).
  - Activity becomes three stacked sections: Transfers (today's Payments tab, keeps proof badges + reverse), Updates (today's feed, auto-loads, manual Refresh removed), Recurring (today's rules tab, auto-loads, manual Refresh removed).
  - Tab values stay stable (`ledger`, `balances`, `paid`/`share` reachable only on desktop) — deep links and desktop untouched.
- **One search row**: `[Search expenses…] [filter icon + count badge]`. The All/Expenses/Payments segmented, Go button, and all 8 filter inputs move into the filter sheet; search submits debounced (600ms) with no Go button.
- **⋯ in the title row** replaces the full-width "More actions" button (Statement/Report/Export/Settings/Share link/Bill flat fee move unchanged into it).
- **One sticky CTA**: "+ New" opens a bottom sheet (Expense / Record payment). Replaces the two-button sticky bar and the inline "+ Expense" toggle — the expense form opens in the existing fullscreen modal.
- **Quiet rows**: Nudge becomes a text link under each debtor row (Pay stays the single primary button); payment Reverse moves into a per-row ⋯ menu; recurring Pause/Delete become swipe-safe row menu items (keep Pause visible, Delete into menu).
- **One People card**: Members + Invite merge — header row "People (n)" + Invite button; rows show avatar + name + role chip only (username/deposit text collapses to one muted line); Leave/Delete group move into the card's ⋯ menu.
- **Calm header**: title + currency chip + net pill only on mobile (role/mode badges move to Settings; budget bar keeps one line: "640 of 1,000 · on track", no card chrome).
- **Auto-load, no Refresh buttons**: Activity sections load on tab open with skeletons (pattern already exists); errors retry via tap on the error banner.

## Capabilities

### New Capabilities
- `mobile-simplify/quiet-mobile`: 3-tab IA, sheet-based creation, icon-triggered filters/menus on mobile

### Modified Capabilities
- `mobile-redesign/responsive-shell`: rail keeps 3 tabs on mobile (7 on desktop); sticky bar becomes single CTA on mobile

## Impact

- Code: `web/src/pages/GroupDetail.jsx` (tab map, toolbar, header, people card), `components/Forms.jsx` (sheet entry — form itself unchanged), `components/Mobile.jsx` (add `RowMenu`, `FilterSheet`), `styles.css`. No API change. Desktop DOM identical.
- Control count on mobile group screen: ~30 → ~10 visible (title ⋯, net pill, settlement box, + New, 3 tabs, search, filter icon, debtor Pay buttons).
- Out of scope: dashboard, expense detail, auth pages; desktop; any capability removal.
- Acceptance: 360px — every trip-pack destination reachable in ≤2 taps from the group screen; no screen shows more than 6 buttons at once (excluding lists); laptop unchanged.
