## MODIFIED Requirements

### Requirement: Guest shares
Optional `guests: [{label 1-50, covered_by, amount_cents?, percent?, shares?}]`, max 20 per expense. `covered_by` must be a (present) participant. Each guest is an extra split line that follows the expense `split_type`; the guest's computed share is added to `covered_by`'s member share. Guests do **not** increase the bill: `amount_cents = amount + tax + tip + fee`, and `sum(member shares) == amount_cents`.

Per method:
- EQUAL: each guest is one head; remainder cents follow the existing deterministic rule (ordered by line id).
- EXACT: `amount_cents` required per guest (≥ 0); `sum(member exact) + sum(guest exact) == split total`, else 422 VALIDATION with the diff.
- PERCENT: `percent` required per guest (≥ 0, 2 dp); members + guests sum to exactly 100.00, else 422.
- SHARES: `shares` integer ≥ 1 (default 1).

Members + guests together: 1–70 lines (50 members + 20 guests).
Responses: preview returns `shares` (per member, guests folded in) plus `guest_shares` (per guest line, in request order). Expense detail `guests[]` returns `share_cents` (computed), `exact_cents`, `percent`, `shares`, `mode` (`split` | `addon`).

#### Scenario: Kid counts as a head (EQUAL)
- **WHEN** 90 EQUAL between Anna, Ben + guest Kid covered by Anna
- **THEN** total is 90, Kid share 30, Anna 60 / Ben 30, payer paid 90

#### Scenario: Extras are shared with guests
- **WHEN** 90 + tax 9 EQUAL between Anna, Ben + guest Kid covered by Anna
- **THEN** total is 99, each line 33, Anna 66 / Ben 33

#### Scenario: EXACT must include guests
- **WHEN** 100 EXACT Anna 40, Ben 40, guest Kid 20 (covered by Ben)
- **THEN** Anna 40 / Ben 60; and if Kid is omitted or sums ≠ 100 → 422 with the diff

#### Scenario: PERCENT with guest
- **WHEN** 200 PERCENT Anna 50, Ben 25, guest Kid 25 (covered by Anna)
- **THEN** Anna 150 / Ben 50

#### Scenario: SHARES with guest
- **WHEN** 100 SHARES Anna 2, Ben 1, guest Kid 1 (covered by Ben)
- **THEN** Anna 50 / Ben 50

#### Scenario: Legacy add-on guest untouched
- **WHEN** an expense created before this change (guest mode `addon`) is read, or edited without guest/money/split fields
- **THEN** amounts, shares and total are unchanged; an edit that sends new `guests` converts them to `split` mode

#### Scenario: Covering member dropped
- **WHEN** `only_present` removes the guest's `covered_by` member
- **THEN** 422 "Guest covered_by must be a participant."
