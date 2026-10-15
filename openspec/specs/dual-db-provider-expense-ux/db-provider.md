## Purpose

Let deployments choose Postgres or SQL Server through configuration only, using a provider strategy that keeps future providers to one new class. This is a new capability for the SplitShare API.

## ADDED Requirements

### Requirement: Provider selection by configuration
`Database:Provider` (`postgres` | `sqlServer`, default `postgres`) selects the EF Core provider at startup with no code changes; unknown values fail fast with a clear error.

#### Scenario: Switch by config
- **WHEN** `Database:Provider` is `sqlServer` with a valid `Database:SqlServer` connection string
- **THEN** the API boots against SQL Server; `/db-ping` returns ok and all existing endpoints behave identically

#### Scenario: Invalid provider rejected
- **WHEN** `Database:Provider` is anything else
- **THEN** startup throws describing the valid values

### Requirement: One squashed provider-clean baseline migration
The three Npgsql migrations squash into a single baseline that applies cleanly to both providers; Postgres history is re-baselined and the `splitshare`-schema history table works on both.

#### Scenario: Fresh Postgres apply
- **WHEN** the API starts against an empty Postgres database
- **THEN** the single baseline creates the full schema and `/db-ping` returns ok

#### Scenario: SQL Server script generation
- **WHEN** `dotnet ef migrations script` runs against the SQL Server provider configuration
- **THEN** it emits valid T-SQL for the full schema with no provider errors

### Requirement: Provider-specific behavior behind the abstraction
Serializable payment guard, error-code mapping (Postgres `40001` vs SQL Server `1205`), and any future dialect differences live in provider implementations, not inline branches.

#### Scenario: Payment race on either provider
- **WHEN** two concurrent payments exceed the debtor's balance
- **THEN** the loser is rejected as OVERPAYMENT on both providers
