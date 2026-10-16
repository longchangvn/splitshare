## 1. Receipt upload works (new expense + expense page + API)

- [x] 1.1 New-expense form: attach up to 5 receipts via FileButton in receipt strip (allow-list accept, 10MB pre-check, Clear); uploaded sequentially after create; per-file failures in `imgErrs` + summary notification; expense still saves
- [x] 1.2 Expense page picker: accept narrowed to API allow-list; 10MB pre-check with friendly error; picker reset via `key` after each attempt; formats hint in empty state
- [x] 1.3 API: `AllowedMimes` += heif/heic-sequence/heif-sequence; `OpenAsync` maps `.heif`; copy carry-over names files `receipt.<ext>` by mime

## 2. Amount-only new expense

- [x] 2.1 "Bill details" accordion item + `bill` JSX removed (desktop + mobile); `setOpenSections` error path drops `'bill'`
- [x] 2.2 Backing bill state + `build()` payload kept so edits preserve legacy tax/tip/FX/guest values

## 3. Bottom bar tap focus

- [x] 3.1 Transient `sel` state set on every tap; cleared on `[path, hash, key]` change
- [x] 3.2 Derived base maps `state.tab === 'activity'` → Activity, `state.openNew` → Add; all five tabs get real `active` (no hardcoded `false`)

## 4. Recurring optimized for mobile

- [x] 4.1 `RecurringForm` stacked layout under 36em (Title / Amount+Every / searchable Payer / full-width Add rule); desktop row unchanged
- [x] 4.2 Mobile rule cards: actions `flex: none` + 44px Pause target

## 5. ⋯ menu covers hidden destinations + export fix

- [x] 5.1 Menu adds Expenses / Balances / Total paid & share (opens Insights) / Payments / Recurring (tab + scroll to anchors) / Invite members / Refresh, behind dividers; section ids `group-tabs`, `m-transfers`, `m-updates`, `m-recurring` with `scrollMarginTop`
- [x] 5.2 Mobile Transfers/Updates/Recurring headers get Refresh links (loads on demand like tab switch)
- [x] 5.3 CSV export appends anchor to DOM before click (iOS), delayed revoke

## 6. Verify

- [x] 6.1 Web build green; API build 0 warn/0 err; backend tests pass with no regressions
- [x] 6.2 Acceptance: receipt attach→save→visible; no bill section any breakpoint; each bottom tab highlights (Activity persists on group page); 360px recurring no h-overflow; ⋯ reaches paid/share/payments/recurring/invite; CSV downloads

## Verification Notes

- Web: vite build green (811 modules). API: build 0 warnings / 0 errors. Backend: 50/50 passed (only pre-existing xUnit1051 analyzer suggestions in test files).
- Static acceptance (2026-10-16): "Bill details" survives only as a code comment in Forms.jsx; no `active={false}` remains in BottomNav (all five tabs derive from `sel ?? base`); GroupDetail has all six jump targets + four scroll anchors with `scrollMarginTop: 72`; CSV export appends the anchor to `document.body` before click.
- Not run: live 360px device spot-check and iOS Safari download (no device in this session); API mime change is additive (existing types unaffected).
