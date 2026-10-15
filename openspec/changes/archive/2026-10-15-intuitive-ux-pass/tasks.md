## 1. Clickable group cards

- [x] 1.1 Whole-card navigation + chevron + hover/focus states on dashboard group rows
- [x] 1.2 Screen-reader label announces group details target

## 2. Loading indicators everywhere

- [x] 2.1 Skeleton placeholders for dashboard, group detail, settlement loads
- [x] 2.2 Table-region loader on ledger tab/filter changes
- [x] 2.3 Loading + disabled state on every mutation button (invite, pay, save, remove, delete, create, search)

## 3. Dashboard boxes

- [x] 3.1 Restructure into Balances / Groups / Quick-actions boxes with icon + title headers
- [x] 3.2 Web build green + 360px/laptop spot-check

## Verification Notes
- web build green (vite 5.4.21, 806 modules, no errors); backend untouched (presentation-only change, no contract change)
- 1.1/1.2: Dashboard.jsx group Card onClick + onKeyDown Enter/Space, ChevronRight trailing icon, .tap-card hover/focus-visible styles, aria-label "View details for {name}"
- 2.1: shape-matching Skeletons in Dashboard (totals + 3 rows), GroupDetail (header + 3 blocks), SettlementBox (52px plan bar)
- 2.2: table-region Loader next to ledger count on type/query/payer refetch
- 2.3: loading + double-submit guards on login/register/create/expense-save/payment/upload/delete/invite/search/profile-save; remove/leave/delete-group use confirm-modal loading state
