---
slug: "splitshare-v1"
createdAt: "2026-10-13T19:47:51.232Z"
---

## Why

Groups sharing trip/food costs collect receipts manually in Excel, split shares, and repay the payer. This change builds SplitShare V1: groups, receipt expenses with images, auto-split, minimum-transfer settlement with explanations, adjustments, pay/settle-up with group-level locking, and per-group / all-groups balance views — served by one .NET 10 API for a React web app and mobile clients.

## What Changes

New full-stack V1 on the existing skeleton (health/db-ping only today):
- API: versioned `/api/v1/*` with standard error envelope, JWT auth (password + Google), contacts, groups + email invites, expenses + image upload, split preview, settlement optimizer + history, payments + settle-up + locking, ledger, balance views.
- Data: full EF Core model (User, Group, GroupMember, Expense, ExpenseSplit, ExpenseImage, Payment, SettlementPlan, ExpenseAudit) with migration, `sum(nets)==0` transactional invariant.
- Settlement: greedy net-balance optimizer (<=n-1 transfers), deterministic ordering, versioned plans with plain-language explanation steps.
- Web: auth, dashboard, group detail with collapsible Why-box, expense CRUD, payment modals (parity with API).
- Docker: existing 3-service compose kept working throughout.

## Capabilities

### New Capabilities
- `api-foundation`: versioning, error envelope, OpenAPI, EF migrations, idempotency keys
- `auth`: register/login/Google/refresh/forgot-reset/profile, contacts derivation
- `groups`: create/invite/join/rotate/remove/leave/delete, email-only invites
- `expenses`: CRUD + image upload, EQUAL/EXACT/PERCENT/SHARES split, preview, audit, frozen-removed-member + un-settle-warning rules
- `settlement`: optimizer, versioned plans, explanation steps, history
- `payments`: record/reverse payments, overpayment guard, group-fully-settled locking
- `ledger-views`: group ledger with filters, per-group/me and all-groups balances
- `web-app`: React flows for all of the above incl. collapsible settlement box

### Modified Capabilities
- (none — greenfield V1, skeleton only)

## Impact

- Code: `api/` (new controllers, services, EF model), `web/` (new routes/components), `docker-compose.yml` unchanged.
- Systems: Postgres `module_platform` DB on `localhost:5433`; email sender needed for invites/reset (stub in dev).
- Out of scope: mobile apps, OCR, bank transfers, multi-currency, SMS.
