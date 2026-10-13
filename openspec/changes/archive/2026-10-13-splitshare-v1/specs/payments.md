## Purpose

Record repayments without mutating original expenses, and lock the group ledger once everyone is settled so history becomes immutable.

## ADDED Requirements

### Requirement: Partial and full payments with overpayment guard
Payments move value from debtor to creditor, allow partial amounts, and reject amounts above the debtor's open balance with the max allowed.

#### Scenario: Partial payment
- **WHEN** a debtor owing $15 records $10 to the creditor
- **THEN** nets update to -$5/+$5, expenses are untouched, and a duplicate delivery with the same Idempotency-Key replays without double-counting

#### Scenario: Overpayment rejected
- **WHEN** a payment exceeds the debtor's open balance
- **THEN** it returns 422 `OVERPAYMENT` with the max allowed; double-submit races reject the second

### Requirement: Group-fully-settled locking
When all nets reach zero, all OPEN expenses and payments lock; locked writes return 403 and corrections use new expenses; recent payments are owner-reversible within 24h only while unlocked.

#### Scenario: Full settle locks
- **WHEN** the last open balance is paid to zero
- **THEN** every OPEN expense/payment in the group becomes LOCKED and further edits return 403 `EXPENSE_LOCKED`
