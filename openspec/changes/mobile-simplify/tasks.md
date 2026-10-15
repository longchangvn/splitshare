## 1. Quiet IA (mobile only, desktop untouched)
- [x] 1.1 3 mobile tabs (Expenses | Balances | Activity); 7 tabs stay on desktop; tab values stable, mobile deep-link fallback to ledger
- [x] 1.2 Balances absorbs paid/share as Insights disclosure (same summary arrays, no new fetch)
- [x] 1.3 Activity = Transfers + Updates + Recurring sections, auto-load on tab open, skeletons, tap-to-retry

## 2. Search + actions
- [x] 2.1 One search row (input + filter icon with count badge); segmented + Go + 8 filters move into sheet; 600ms debounce, request-counter dedupe
- [x] 2.2 ⋯ in title row replaces full-width More actions (same handlers)
- [x] 2.3 Single + New sticky CTA → bottom sheet (Expense / Record payment); reuses showExp/payOpen state; desktop two-button bar unchanged

## 3. Quiet rows + people + header
- [x] 3.1 Nudge → text link on mobile; Reverse → per-row ⋯ menu; recurring Pause visible + Delete in menu (shared RowMenu in Mobile.jsx)
- [x] 3.2 One People card (header People (n) + Invite + ⋯ for Leave/Delete); desktop Members/Invite grid identical
- [x] 3.3 Calm header (title + currency + net on mobile; role/mode into Settings); budget → one-line Progress on mobile

## 4. Verify
- [x] 4.1 Web build green; backend 50/50 (no API change); 360px spot-check: ≤6 buttons/screen, every destination ≤2 taps, no page h-scroll

## Verification Notes
- web build green (vite 810 modules); backend 50/50.
- Desktop DOM identical: header badges, 7 tabs, two-row toolbar with Go, two-button sticky bar, Members/Invite grid, Refresh buttons — all gated behind !isMobile / visibleFrom.
- Mobile: title ⋯ menu, 3 tabs (Expenses/Balances/Activity), debounced search, + New sheet (bottom-anchored Modal styles), Insights Collapse, Transfers/Updates/Recurring in Activity, People card.
