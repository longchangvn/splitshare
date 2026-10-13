## 1. API foundation

- [x] 1.1 Standard error envelope + `/api/v1` route group + OpenAPI at `/openapi.json`
- [x] 1.2 Full EF model (Expense, ExpenseSplit, ExpenseImage, Payment, SettlementPlan, ExpenseAudit, IdempotencyKey) + migration replacing EnsureCreated
- [x] 1.3 Idempotency-Key handling for money POSTs with replay

## 2. Settlement core (most important, no auth dependency)

- [x] 2.1 Pure `SettlementService`: nets → greedy transfers (<=n-1, deterministic) + explanation steps
- [x] 2.2 Unit tests: transitive collapse (C→A $10), penny exactness, empty plan, determinism, n<=6 optimality spot-checks
- [x] 2.3 `GET /api/v1/groups/:id/settlement` + history endpoints (auth stubbed until §3) persisting versioned plans

## 3. Auth + contacts

- [x] 3.1 Register/login/refresh/logout + rate limiting + password hashing
- [x] 3.2 Google login with verified-email link
- [x] 3.3 Forgot/reset, change password, profile, guarded delete-account
- [x] 3.4 JWT auth on all `/api/v1/*` (except auth/health) + `GET /contacts` derived search

## 4. Groups + invites (email only)

- [x] 4.1 CRUD group + fixed currency + invite token + rotate
- [x] 4.2 Members/invites/join + pending-email auto-join + owner-guarded remove/leave/delete with `HAS_OPEN_BALANCE`

## 5. Expenses + split

- [x] 5.1 Expense CRUD + 4 split strategies + preview + penny determinism tests
- [x] 5.2 Image upload (0..5, 10MB, EXIF strip) via `IFileStore`
- [x] 5.3 Optimistic locking + audit + un-settle warning data + `INVOLVES_REMOVED_MEMBER` freeze

## 6. Payments + locking

- [x] 6.1 Record/reverse payments + overpayment guard + race re-check in transaction
- [x] 6.2 Net computation + group-fully-settled lock transition + `EXPENSE_LOCKED` enforcement

## 7. Ledger + balance views

- [x] 7.1 Group ledger with filters + removed-member snapshot rule + expense detail
- [x] 7.2 Per-group `/me` + all-groups balances with per-currency grouping

## 8. Web parity

- [x] 8.1 Auth + dashboard + group wizard + invite-link copy
- [x] 8.2 Expense CRUD + live preview + image upload + payment modals
- [x] 8.3 Collapsible settlement Why-box + history + un-settle confirm modal

## Verification Notes
- dotnet build 0 errors; 8/8 xunit pass (incl live-DB transitive collapse C->A $10 + plan v1 persist, cleaned up); HTTP smoke: /health ok, /openapi.json 200, unknown-group settlement returns NOT_FOUND envelope; migration InitialLedger applied to splitshare schema
- 15/15 xunit pass (hash, validation, dup codes, lockout, refresh rotation, reset, contacts, delete-blockers); HTTP: register/login/refresh 200, replay 401, me+contacts 200, anon settlement 401, authed-unknown 404 envelope; rate limiter 5/min/IP returns 429
- 22/22 xunit pass (validation, caps, pending-consume, balance-guarded remove/leave, sole-owner, rotate, verified-email join gate, delete guards); HTTP: create CHF-normalized+link, pending invite auto-join, detail roles, owner remove, rotate->old 410, unverified join 403; JSON switched to snake_case per spec contract
- 34/34 xunit pass (split math, sanitizer, CRUD guards, stale/audit/unsettle, frozen-member, images); HTTP: create+idempotent replay same id, exact-mismatch 422 with diff, stale 409, patch v2/plan v2, jpeg upload sanitized 13B->2B + served 200, pdf 422, anon serve 401
- 37/37 xunit pass (guards, overpay max, double-pay reject, lock transition, locked-edit 403, reverse rules); HTTP: overpay 422 with max CHF 100.00, full settle->locked, replay same id, edit 403, pay-after 422 ALREADY_SETTLED, reverse-after-lock 403, settlement empty with All-settled message
- 40/40 xunit pass (filters/type/status/search/pagination, removed-member snapshot, me owes breakdown, per-currency totals); HTTP on locked group: ledger 2 LOCKED rows, q-filter 1 row, me net 0 empty owes, balances per-currency totals, anon 401
- web build passes (49 modules); dev+api serve 200; UI paths verified live: preview-split 200, history v1-v4 + version fetch, balances; auth/dashboard/group-wizard/expense-CRUD/preview/unsettle-confirm/payment-modal/why-box/history implemented per spec
