## Purpose

Minimum-transfer debt settlement with full auditability. This is the most important feature: fewer repayments, with a plain-language explanation of how the result was derived.

## ADDED Requirements

### Requirement: Greedy net-balance optimizer over OPEN ledger
Settlement recomputes synchronously on every ledger mutation over unlocked entries only, yielding at most n-1 transfers with deterministic tie-breaks.

#### Scenario: Transitive debt collapse
- **WHEN** raw debts are `B→A $10` and `C→B $10` (nets `A:+10, B:0, C:-10`)
- **THEN** the plan contains exactly one transfer `C→A $10` and B is excluded

#### Scenario: Empty plan when settled
- **WHEN** all group nets are zero
- **THEN** transfers are empty with an `All settled` message

### Requirement: Versioned plans with plain-language explanation
Every recompute stores a new version with inputs hash, before/after nets, numbered steps, and raw-debt comparison for the collapsible Why-box; history keeps 100 versions.

#### Scenario: Explanation content
- **WHEN** a client expands the Why-box for the current plan
- **THEN** it shows nets-before table, numbered steps naming users and cents, final transfers, version/timestamp/hash, and a 5→2 style savings header

### Requirement: No cross-group netting
Plans never mix groups; stale plan versions on payment submit recompute and report `superseded:true`.

#### Scenario: Two-group user
- **WHEN** a user owes in two groups
- **THEN** each group exposes its own independent plan
