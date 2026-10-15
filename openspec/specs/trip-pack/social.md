## Purpose

Money splits need conversation (comments), social pressure (nudges), and a single narrative (activity feed).

## ADDED Requirements

### Requirement: Expense comments
`POST /expenses/:id/comments {body 1-1000}`, `GET` list, `DELETE /comments/:id` (author or owner). Visible to viewers of the expense.

#### Scenario: Question on a bill
- **WHEN** Bea comments "why $80?" and the payer replies
- **THEN** both render chronologically under the expense

### Requirement: Nudges
`POST /groups/:id/nudges {user_ids[]}` from any member; targets must have net<0; max 1/day per (group, from, to) else 422 `NUDGE_LIMIT`. Sends email via `IEmailSender`, stores row, appears in activity.

#### Scenario: Polite poke
- **WHEN** Ana nudges debtor Ben twice in one day
- **THEN** first sends, second is rejected with NUDGE_LIMIT

### Requirement: Activity feed
`GET /groups/:id/activity?limit=` merges expense-created, payments, comments, nudges, member joins, newest first. No new table.

#### Scenario: Catch up
- **WHEN** opening the Activity tab after a week away
- **THEN** payments, comments, nudges, and joins appear in one timeline
