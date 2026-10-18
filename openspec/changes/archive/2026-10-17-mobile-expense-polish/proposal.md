---
slug: "mobile-expense-polish"
createdAt: "2026-10-16T00:00:00.000Z"
---

## Why

Five mobile defects/gaps reported against the group + expense flow: (1) receipt upload appears broken — the new-expense form has no picker at all and the expense-page picker accepts types the API rejects (`image/*` vs allow-list, no `heif`); (2) the new-expense form exposes the full trip-pack bill section (tax/tip/fee, FX, guests, only-present) for what should be an amount-only quick add; (3) the bottom tab bar never highlights Add/Activity — Activity deep-links to a group page so the path-derived logic sticks on Groups; (4) the recurring-rule form is a 5-across row that is unusable at 360px; (5) desktop-only destinations (paid/share/payments/recurring views, invite, refresh) have no mobile entry point outside nested sections, and CSV export uses a detached-anchor click that iOS Safari ignores.

## What Changes

- **Receipt upload works end to end**: attach up to 5 receipts inside the new-expense form (uploaded right after create); expense-page picker restricted to the API allow-list with a 10MB client pre-check and picker reset so retries work; API allow-list gains `heif`/`heic-sequence`/`heif-sequence`; copy carry-over uses a real filename extension.
- **Amount-only new expense**: the "Bill details" accordion/section (tax/tip/fee, foreign currency, guest shares, only-present) is removed from the form UI; values stay in the payload so edits never silently clear them.
- **Bottom bar focus follows taps**: clicked tab highlights instantly (local `sel` state); location-derived base maps `state.tab === 'activity'` → Activity and `state.openNew` → Add; selection clears on navigation so back-button/deep links stay correct.
- **Recurring optimized for mobile**: stacked one-field-per-row form (Title, Amount+Every, searchable Payer, full-width Add rule); rule cards keep actions unsqueezed with 44px targets.
- **⋯ menu covers hidden destinations**: Expenses, Balances, Total paid & share (opens Insights), Payments, Recurring (tab switch + smooth scroll to section anchors), Invite members, Refresh; Refresh links added to mobile Transfers/Updates/Recurring headers; CSV export appends the anchor to the DOM for iOS.

## Capabilities

### New Capabilities
- `mobile-expense-polish/new-expense-upload`: attach receipts during creation, uploaded post-create

### Modified Capabilities
- `mobile-simplify/quiet-mobile`: simplified expense form (bill section removed), extended ⋯ menu, mobile recurring form
- `mobile-redesign/responsive-shell`: bottom tab bar tap-focus for all five tabs
- Expense image upload contract: allow-list extended with heif family (API, no route change)

## Impact

- Code: `web/src/components/Forms.jsx` (upload + simplify), `web/src/pages/ExpenseDetail.jsx` (picker), `web/src/pages/GroupDetail.jsx` (⋯ menu, recurring form, anchors, export fix), `web/src/components/BottomNav.jsx` (focus), `api/Expenses/ExpenseService.cs` + `FileStore.cs` (mime allow-list). Desktop DOM unchanged except the shared simplified expense form (bill fields were trip-pack extras; edits preserve values).
- Out of scope: dashboard, auth pages, statement/report pages (already mobile-card layouts).
- Acceptance: new expense with 2 receipts saves + shows them; bill section gone on all breakpoints; tapping each bottom tab highlights it (Activity stays highlighted on the group page); 360px recurring form has no h-overflow; every desktop destination reachable from mobile ⋯; CSV downloads on iOS.
