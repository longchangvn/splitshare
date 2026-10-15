## Context

Trip/roommate/event groups need richer expenses, budgets, reminders, and proof of payment. Backend is EF Core (Postgres prod, InMemory tests) with `MigrateAsync` at startup; web is React + Mantine with snake_case JSON. No new NuGet packages (offline-safe): everything builds on existing tables/services.

## Goals / Non-Goals

**Goals:** every must-have + good-to-have feature live end-to-end (API + UI), additive-only contract changes, existing 43 tests stay green.
**Non-Goals:** PSP integration, live FX rates, OCR provider, push, cross-group netting.

## Decisions

1. **Additive schema, one migration**: new nullable columns/tables only; `dotnet ef migrations add TripPack`. InMemory tests ignore migrations.
2. **Guest shares ride on top**: guest amounts increase the bill total and the covering member's share (`paid += guests`, `share[cover] += guests`). Invariant sum(shares)==total preserved; nets math untouched.
3. **Extras (tax/tip/fee) fold into the split base**: `split_total = amount + tax + tip + fee`; detail shows line items. Split algorithms unchanged.
4. **Manual FX at entry**: `orig_currency + orig_amount + fx_rate` → `amount = round(orig*rate)`; both stored. No rate service.
5. **Recurring materializes on read**: `RecurringService.MaterializeDueAsync` runs inside group-detail/ledger reads (idempotent via `LastRunAt` + date check), not a background worker. Zero new infra.
6. **Activity is derived, not stored**: feed merges expenses/payments/comments/nudges/joins at query time. One less table, always consistent.
7. **Treasurer = money role**: can record any payment, edit any OPEN expense, reverse within 24h; cannot remove/rotate/delete. Owner-only role assignment.
8. **Public share is a separate anonymous surface**: `ShareToken` + `AllowAnonymous` endpoint returning names + totals only (no emails/usernames/handles).
9. **OCR is capability-gated**: `IOcrService` + config flag; `POST /expenses/ocr` returns 501 until a provider is wired; UI hides the button via `GET /capabilities`.
10. **Nudges are polite + throttled**: only to net<0 members, max 1/day per (group, from, to) → 422 `NUDGE_LIMIT`; email via existing `IEmailSender`.

## Risks / Trade-offs

- On-read recurring materialization adds write I/O to reads; bounded (only due rules, one expense each per period) and documented.
- Update flow with extras/guests requires full split detail when money fields change (same rule as amount today).
- Public share token leaks names + totals by design; rotatable by owner (rotate-invite also rotates share token? No — separate rotate endpoint).
