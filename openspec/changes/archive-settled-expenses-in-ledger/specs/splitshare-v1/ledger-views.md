## Purpose

Delta for `splitshare-v1/ledger-views`: present settled (`LOCKED`) ledger entries as an archive — active-ledger default view, Archived status scope, and scoped search — without changing the API contract or report math.

## MODIFIED Requirements

### Requirement: Filterable group ledger with detail
Active members see the group ledger **defaulting to active (`OPEN`) entries only**; `LOCKED` entries remain reachable through the status filter's Archived scope (API value `LOCKED`, label "Archived"). Removed members see a snapshot up to removal plus own payments; detail shows splits, images, audit, and settlement version. Ledger search (`q`) applies only within the selected status scope, so by default search covers active entries only. An entirely settled group (no OPEN entries) shows a dedicated "all settled — view archive" empty state instead of a bare empty list.

#### Scenario: Removed member privacy
- **WHEN** a removed member fetches the ledger
- **THEN** only entries up to removal plus own payments are visible

#### Scenario: Default view is active-only
- **WHEN** a member opens the group ledger without touching filters
- **THEN** the list requests `status=OPEN` and shows only unsettled expenses/payments

#### Scenario: Archived scope reachable
- **WHEN** the member selects the Archived status filter
- **THEN** the list requests `status=LOCKED` and shows settled entries as the archive, including their status presented as "Archived"

#### Scenario: Search scoped to status
- **WHEN** the member searches while on the default (active) view
- **THEN** only active entries matching the query are returned; switching to Archived searches the archive instead

#### Scenario: Fully settled empty state
- **WHEN** every balance in the group is settled and the active view has no entries
- **THEN** the view shows an "all settled" empty state with a path to the archive, not a blank list

## ADDED Requirements

### Requirement: Archived entries stay in financial history
Archiving is presentation-only: statement, report, exports, settlement box, and all monetary totals continue to include `LOCKED` entries, and the API `status=OPEN|LOCKED` contract and balance math are unchanged.

#### Scenario: Reports include archive
- **WHEN** a member opens the statement/report for a group with archived entries
- **THEN** archived entries and their amounts are included exactly as before the archive change

#### Scenario: Balance math unchanged
- **WHEN** the ledger view filters to active entries
- **THEN** `needs_settlement`, `delinquent` (>30d), and per-member nets are computed from OPEN rows as before, unaffected by what the list displays
