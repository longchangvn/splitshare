## Purpose

Never leave the user staring at blank space or wondering if a tap registered. Every async state gets a visible indicator.

## ADDED Requirements

### Requirement: Shape-matching skeletons for page loads
Dashboard, group detail, and settlement box render skeleton placeholders shaped like their content while loading, replaced atomically on data arrival (no layout jump beyond the skeleton frame).

#### Scenario: Cold dashboard load
- **WHEN** balances/groups are fetching
- **THEN** shimmer cards (totals cards + 3 group rows) show instead of empty sections

#### Scenario: Group detail load
- **WHEN** detail/ledger/summary are fetching
- **THEN** header, ledger-row, and settlement skeletons show; ledger tab changes show a table-region loader

### Requirement: Loading state on every mutation button
Invite, pay, save, remove, delete, create, and search buttons show loading spinners and disable while their request is in flight.

#### Scenario: Double-tap save
- **WHEN** tapping Save twice quickly on the expense form
- **THEN** only one request is issued (button disables on first submit)
