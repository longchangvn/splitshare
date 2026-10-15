## Purpose

Expenses carry the context trips need: what kind, when, real bill math, foreign money, and who's covered.

## ADDED Requirements

### Requirement: Categories + spent date
Create/update accept `category` (food|transport|stay|activity|shopping|health|bills|other, default other) and `spent_at` (default now, max +24h). Ledger filters by `category`; `GET /groups/:id/breakdown` returns per-category paid/share.

#### Scenario: Trip food total
- **WHEN** `GET /groups/:id/breakdown` after food + transport expenses
- **THEN** per-category paid/share rows sum to the ledger totals

### Requirement: Tax/tip/fee lines
Optional `tax`, `tip`, `fee` (decimals ≥ 0) fold into the split total: `split_total = amount + tax + tip + fee`. Detail shows each line. Changing them on edit requires full split detail (same as amount).

#### Scenario: Restaurant bill
- **WHEN** creating amount 100 + tax 7 + tip 10, EQUAL 2 ways
- **THEN** shares are 58.50/58.50 and `tax_cents=700` persists

### Requirement: Manual FX at entry
Optional `orig_currency` (≠ group currency) + `orig_amount` + `fx_rate` (>0, all-or-nothing); `amount = round(orig*rate, 2)`. All three stored and shown.

#### Scenario: Pay in yen
- **WHEN** creating orig JPY 10000 @ 0.0066 in a USD group
- **THEN** amount is 66.00 USD with the FX triple visible

### Requirement: Guest shares
Optional `guests: [{label 1-50, amount_cents > 0, covered_by}]`; covered_by must be a participant. Guest total increases the bill and the covering member's share. Shown as "Name (+Guest $X)" lines.

#### Scenario: Kid's meal
- **WHEN** 100 EQUAL 2-way + guest Kid 20 covered by Anna
- **THEN** shares are Anna 70 / Ben 50, payer paid 120

### Requirement: Present-only split
`only_present: true` drops participants (not the payer) whose `JoinedAt > spent_at`; ≥1 must remain. Preview shows the resulting set.

#### Scenario: Late joiner excluded
- **WHEN** day-1 dinner is created with only_present and Cara joined day 3
- **THEN** 422-free creation splits among pre-day-3 members only
