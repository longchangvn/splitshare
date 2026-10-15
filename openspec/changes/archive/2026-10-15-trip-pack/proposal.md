---
slug: "trip-pack"
createdAt: "2026-10-15T18:49:05.000Z"
---

## Why

SplitShare handles one-off equal splits well, but real trip / roommate / event usage breaks down: no categories or dates on expenses, no tax/tip handling, no budgets, settling means manually typing amounts with no account info, no reminders, no recurring bills, no discussion, no export, and account-recovery/rename/reverse exist only as API. This pack closes those gaps plus high-value follow-ups (FX, late joiners, guests, statements, event mode, treasurer, templates, filters, public share link).

## What Changes

- Expenses gain category, spent-at date, tax/tip/fee lines, manual-FX fields, guest shares, present-only split option.
- Groups gain budget + alert, mode (shared/trip/event), flat fee, deposit flags, public share token, from-template creation.
- New: comments, nudges (rate-limited), activity feed, CSV export, per-member statement, category breakdown, recurring rules (materialized on read), payment handles + proof, OCR-gated endpoint + capabilities flag, treasurer role.
- Web: all of the above surfaced (forms, tabs, pages: statement, trip report, public share, forgot/reset/verify), full ledger filter toolbar.

## Capabilities

### New Capabilities
- `trip-pack/expense-richness`: category, spent_at, extras, FX, guests, present-only
- `trip-pack/group-money`: budgets, event mode + deposits + flat fee, templates, share links
- `trip-pack/social`: comments, nudges, activity feed
- `trip-pack/money-out`: payment handles, proof, statement, CSV export, trip report
- `trip-pack/recurring`: rules + on-read materialization
- `trip-pack/access`: forgot/reset/verify UI, rename UI, reverse UI, treasurer role, public share page

### Modified Capabilities
- `splitshare-v1/ledger-views`: ledger gains category filter (no contract break: additive query param + fields)
- `splitshare-v1/expenses`: create/update accept additive optional fields (old clients unaffected)

## Impact

- Code: `api/Models/*`, `api/Data/AppDbContext.cs`, new EF migration, `Expenses/`, `Groups/`, `Payments/`, new `Social/` + `Recurring/` services, new endpoints, `web/src` pages/components.
- Out of scope: real PSP money movement, automatic FX rates, ML OCR provider (gated stub), push notifications, native apps.
