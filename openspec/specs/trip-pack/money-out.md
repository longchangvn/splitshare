## Purpose

Settling up needs account info (handles), proof, personal statements, and portable records (CSV/report).

## ADDED Requirements

### Requirement: Payment handles + settle sheet
`CRUD /me/handles {label, details}` (e.g. bank + number). Settlement Pay opens the receiver's handle + exact amount; recording accepts `proof_ref` (≤140, e.g. txn id) and one proof image (`POST /payments/:id/proof`).

#### Scenario: QR settle
- **WHEN** Ben pays Ana 25.00 and attaches proof
- **THEN** payment shows proof_ref + image badge in history

### Requirement: Per-member statement
`GET /groups/:id/statement/{uid}` returns chronological entries (expense-in, expense-paid, payment-out/in) with running balance + closing net. Member-visible only.

#### Scenario: Dispute
- **WHEN** fetching Cara's statement
- **THEN** entries sum exactly to her current net

### Requirement: CSV export + trip report
`GET /groups/:id/export.csv` (expenses + payments + summary sections) as file download. Web `/groups/:id/report` renders a printable summary (totals, per-person, settlement, category breakdown).

#### Scenario: Reconcile
- **WHEN** downloading export.csv
- **THEN** expense rows, payment rows, and per-member totals are all present

## Purpose (recurring)

Roommate/subscription bills repeat; the app replays them.

## ADDED Requirements

### Requirement: Recurring rules
`CRUD /groups/:id/recurring {title, amount, split_type, payer_id, participant_ids, frequency: weekly|monthly, starts_at}` with `active` toggle. Due rules materialize one expense per period inside group-detail/ledger reads (idempotent).

#### Scenario: Monthly rent
- **WHEN** a monthly rule is due and the ledger is read
- **THEN** exactly one rent expense exists; a second read creates nothing

## Purpose (access)

Missing UI for existing APIs plus treasurer delegation.

## ADDED Requirements

### Requirement: Auth + rename + reverse UI
Forgot/reset/verify pages, group rename control (owner), reverse-payment button (eligible: own/owner-or-treasurer, <24h, OPEN).

#### Scenario: Recovery
- **WHEN** a logged-out user submits forgot + reset
- **THEN** they land logged in without support

### Requirement: Treasurer role
Owner assigns `member|treasurer` (`PATCH /groups/:id/members/{uid}`). Treasurer may record any payment, edit any OPEN expense, reverse within 24h; cannot remove/rotate/delete.

#### Scenario: Delegation
- **WHEN** treasurer Theo records Mia→Zed 30
- **THEN** 201; but removing a member is still 403
