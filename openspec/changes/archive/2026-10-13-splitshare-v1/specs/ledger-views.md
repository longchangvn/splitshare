## Purpose

Transparent audit and personal balance views: every member can always inspect the group ledger, and each user sees what they owe per group and across groups without cross-currency summation.

## ADDED Requirements

### Requirement: Filterable group ledger with detail
Active members see the full ledger; removed members see a snapshot up to removal plus own payments; detail shows splits, images, audit, and settlement version.

#### Scenario: Removed member privacy
- **WHEN** a removed member fetches the ledger
- **THEN** only entries up to removal plus own payments are visible

### Requirement: Per-group and all-groups balances
Group view shows net plus owes/owed-to breakdown; dashboard groups rows by currency and flags >30d unsettled balances.

#### Scenario: Multi-currency dashboard
- **WHEN** a user has balances in USD and EUR groups
- **THEN** totals render per currency and are never summed across currencies
