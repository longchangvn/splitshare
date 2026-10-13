## Purpose

React web parity with the API for all V1 flows, including the signature collapsible settlement explanation box.

## ADDED Requirements

### Requirement: Full V1 web flows
Web covers auth (incl. Google), dashboard, group wizard + link copy, expense CRUD with live split preview, payment modals, ledger with filters, and balance headers — responsive 360–1280px and keyboard-accessible.

#### Scenario: Happy path without Excel
- **WHEN** a user registers, creates a group, invites by email, adds a receipt with image, and settles up
- **THEN** every step completes in the browser against the same API mobile will use

### Requirement: Collapsible settlement Why-box
The settlement box defaults collapsed with a savings header and expands to nets-before, numbered steps, final transfers with Pay buttons, version/timestamp/hash, and raw-debt toggle; un-settling edits show the blocking confirm modal.

#### Scenario: Why-box expanded
- **WHEN** a member expands the box on a 5-debts→2-transfers plan
- **THEN** all explanation elements render with exact names and cents, and history versions render read-only
