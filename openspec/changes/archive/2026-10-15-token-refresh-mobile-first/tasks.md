## 1. Transparent refresh in web client

- [x] 1.1 Single-flight refresh + retry-once in `api.js`, auth-path guard, session-expired error code
- [x] 1.2 Keep logout-on-dead-refresh behavior (Guard → /login unchanged)

## 2. Mobile-first fluid UI

- [x] 2.1 Ledger + Balances tables scroll horizontally on narrow screens
- [x] 2.2 Expense participant rows stack with full-width inputs; split-type selector adapts under sm
- [x] 2.3 Payment/invite/new-group modals fullscreen on small screens; 44px touch targets
- [x] 2.4 Web build green + 360px/390px/laptop spot-check

## Verification Notes
- web build green; 8/8 node harness assertions pass on real api.js (single-flight, retry-once, auth-path guard, SESSION_EXPIRED+clear); backend untouched
