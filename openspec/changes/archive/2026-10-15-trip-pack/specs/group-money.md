## Purpose

Groups manage money goals (budgets, event fees, deposits) and share read-only views publicly.

## ADDED Requirements

### Requirement: Budgets + alerts
`PATCH /groups/:id` accepts `budget` (decimal > 0, null clears) and `budget_alert_pct` (1-100). Detail returns `budget {cents, spent_cents, pct, alert, over}`. Crossing the threshold on expense create emails the owner.

#### Scenario: Budget watch
- **WHEN** spent passes 80% of a 1000 budget
- **THEN** detail shows alert=true and owner gets one email per crossing

### Requirement: Event mode + flat fee + deposits
Group `mode` (shared|trip|event). Event mode: `flat_fee` settable; `POST /groups/:id/flat-fee {payer_id, title?}` creates an EQUAL expense of flat_fee across active members; `PATCH /groups/:id/members/{uid}/deposit {paid}` toggles (self, owner, or treasurer); member list shows deposit flags.

#### Scenario: Retreat fee
- **WHEN** flat_fee 200 x 4 members, payer Olga
- **THEN** one 800 EQUAL expense exists and deposits checklist tracks 4 flags

### Requirement: Templates
`POST /groups/from-template {name, currency, template: roommates|beach-trip|wedding, inputs?}` creates a preconfigured group (mode, budget?, flat_fee?, starter recurring rules for roommates rent/wifi as inactive drafts).

#### Scenario: Roommates setup
- **WHEN** creating from template roommates
- **THEN** group exists in shared mode with monthly rent/wifi rule drafts ready to activate

### Requirement: Public share link
`POST /groups/:id/share-link` (owner) issues/rotates token; `GET /api/v1/shared/{token}` (anonymous) returns name, currency, totals, per-member paid/share/net with display names only. Web `/s/:token` renders it without login.

#### Scenario: Outsider check
- **WHEN** opening /s/:token logged out
- **THEN** totals + per-person nets render, no emails/usernames/handles
