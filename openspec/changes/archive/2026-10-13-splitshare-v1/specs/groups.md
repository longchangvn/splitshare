## Purpose

Group lifecycle for expense sharing with email-only invites. Any member can invite; only owners manage membership and destructive actions. Currency is fixed per group.

## ADDED Requirements

### Requirement: Group creation with fixed currency
Groups are created with name and immutable currency; creation generates a rotatable invite token.

#### Scenario: Create group
- **WHEN** a client posts `{name, currency, member_ids[], invite_emails[]}` (max 50 members)
- **THEN** it returns the group plus `invite_link https://app.../g/<token>`; currency cannot change after the first expense

### Requirement: Email invites and link join
Members invite via contacts or email; invitees join via token link; pending email invites auto-join on registration within 30 days.

#### Scenario: Pending invite auto-join
- **WHEN** an unregistered email is invited and later registers with that email
- **THEN** membership is granted automatically; rotated tokens return 410 `INVITE_ROTATED`

### Requirement: Owner-guarded membership changes
Any member may invite; only owners may remove, rotate invites, or delete groups; removal/leave is blocked by open balances.

#### Scenario: Remove blocked by balance
- **WHEN** an owner removes a member with `net != 0`
- **THEN** it returns 422 `HAS_OPEN_BALANCE` with the amount; removed users render as `Name (removed)` with snapshot history
