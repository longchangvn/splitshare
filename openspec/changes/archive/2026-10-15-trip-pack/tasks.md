## 1. Backend models + migration
- [x] 1.1 Expense: category/spent_at/tax/tip/fee/FX triple; ExpenseGuest table; Group: budget/mode/flat_fee/share_token; GroupMember: deposit_paid; PaymentHandle, PaymentProof, ExpenseComment, Nudge, RecurringRule tables; DbContext config; `TripPack` migration
- [x] 1.2 ExpenseService: extras/FX/guests/only_present/category in create+update+preview (+preview-edit), MapExpense extended, breakdown query
- [x] 1.3 GroupService: budget/mode/flat_fee/share-token/templates/treasurer-role/deposit/budget-alert email; from-template
- [x] 1.4 Payments: treasurer recorder + reverse, proof_ref + proof image, handles CRUD
- [x] 1.5 Social: comments CRUD, nudges + throttle + email, activity feed merge, statement, CSV export
- [x] 1.6 Recurring: rules CRUD + on-read materialization; OCR-gated endpoint + capabilities; new endpoint wiring in Program.cs
- [x] 1.7 New backend tests (extras math, guests, FX, nudge limit, treasurer, recurring idempotency); all 43 existing green

## 2. Web UI
- [x] 2.1 ExpenseForm: category/spent_at/tax/tip/fee/FX/guests/only-present; detail lines + comments; full ledger filter toolbar (status/amount/date/sort/category)
- [x] 2.2 Group: budget bar + alerts, event flat-fee + deposits, templates in new-group modal, rename, share-link, export + report link, activity tab, statement page, nudges in Balances
- [x] 2.3 Settle: handles in Profile, settle sheet with handle + proof, reverse buttons, Payments history proof badges
- [x] 2.4 Access: forgot/reset/verify pages, public /s/:token page, trip report page, capabilities-gated scan button
- [x] 2.5 Web build green

## Verification Notes
- Backend: 50/50 tests pass (43 existing + 7 TripPackTests); `TripPack` EF migration scaffolded and applied to dev Postgres on boot.
- Live smoke vs Postgres: expense 100+7+10+guest20 = 137.00 food ✓; JPY10000@0.0066 → 66.00 ✓; comment 201 ✓; nudge then 422 NUDGE_LIMIT ✓; ledger/statement (Bob −58.50 exact) ✓; breakdown ✓; handles ✓; payment proof_ref + reverse ✓; budget 40.6% ✓; anonymous /shared ✓; wedding template ✓; treasurer role ✓; export.csv 200 ✓; OCR 501-gated ✓; smoke data cleaned (expenses deleted, group deleted).
- Web: vite build green; new routes /forgot /reset/:token /verify/:token /s/:token /groups/:id/statement /groups/:id/report.
