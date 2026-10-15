## 1. Shell + navigation chrome
- [x] 1.1 Compact header under sm (avatar Menu), desktop unchanged
- [x] 1.2 Scroll-snap tab rail (no wrap), sticky money-action bar, collapsible filter shelf

## 2. Lists → cards on mobile
- [x] 2.1 Ledger dual-render (cards under sm, table on sm+)
- [x] 2.2 Paid/share tabs + statement + report per-person via shared card list
- [x] 2.3 Member rows collapse to per-row Menu on mobile

## 3. Actions + forms
- [x] 3.1 Header secondary actions into one More menu
- [x] 3.2 Expense form sections (Basics/Bill/Split) collapsible on mobile, sticky save, error auto-expand

## 4. Verify
- [x] 4.1 Web build green; 360px spot-check (no page h-scroll, no truncation, tabs swipe); backend tests still 50/50 (no API change)

## Verification Notes
- web build green (vite, no errors); backend 50/50 (no API touched).
- Shell: desktop row `visibleFrom="sm"` untouched; mobile avatar Menu (`hiddenFrom="sm"`) with name, unverified flag, Profile, Log out; unverified badge collapses to "!" with title.
- Tabs: `.tab-rail` scroll-snap + nowrap + fade mask; same Tabs state; ledger/balances/paid/share/payments/activity/recurring swipe in one row.
- Sticky bar CSS-only under 36em (static desktop); safe-area inset; spacer after.
- Filters: desktop two-row toolbar identical; mobile segmented+search+Go + "Filters (n)" Collapse with Apply.
- Ledger cards are tappable (whole-card nav + keyboard, copy/edit stopPropagation); totals card; desktop table byte-identical.
- Paid/share via shared `NameValueList` (Mobile.jsx), reused in report categories; statement + report per-person dual-rendered.
- Member rows: desktop buttons identical; mobile ⋯ Menu calling same handlers/guards.
- ExpenseForm: same controlled inputs in both trees (no state fork); mobile Accordion (Basics open), error submit expands all; save sticky on mobile.
- display:none trees (`hiddenFrom/visibleFrom`) are skipped by screen readers — no duplicate announcements.
