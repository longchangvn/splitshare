## Purpose

Receipt expense capture with image proof and deterministic auto-splitting. The server is the source of truth for all share math, including penny distribution.

## ADDED Requirements

### Requirement: Expense creation with payer and images
Expenses carry title, amount, explicit payer (active member), participants, and 0..5 images (10MB each, EXIF GPS stripped).

#### Scenario: Create with image
- **WHEN** a member posts a valid expense and attaches a receipt image
- **THEN** the expense persists with splits summing exactly to the total and images served via 15-min signed URLs

### Requirement: Deterministic split strategies
EQUAL/EXACT/PERCENT/SHARES splits are server-computed; any remainder cents go to lowest `user_id` first; `POST preview-split` previews without persisting.

#### Scenario: Equal split remainder
- **WHEN** $10.00 splits equally among 3
- **THEN** shares are $3.34/$3.33/$3.33 with the +1c owner shown; EXACT/PERCENT mismatches return 422 with the diff

### Requirement: Audited edits with settle-safety rules
OPEN expenses are editable by creator/owner under optimistic locking; edits recompute splits, audit the diff, recompute settlement, warn on un-settling zero-net members, and refuse expenses touching removed members.

#### Scenario: Edit un-settles member
- **WHEN** an edit preview moves a `net==0` member to non-zero
- **THEN** the client shows a blocking confirm listing them, and success returns `unsettled_user_ids[]` plus push/email to affected users

#### Scenario: Frozen removed member
- **WHEN** an edited expense involves a removed payer/participant
- **THEN** it returns 422 `INVOLVES_REMOVED_MEMBER`; LOCKED expenses return 403 `EXPENSE_LOCKED` with a correction-expense affordance
