## Purpose

Account access and contact discovery for SplitShare. Every user needs an account; contacts are derived from shared groups for member picking and autocomplete.

## ADDED Requirements

### Requirement: Password registration and login
Users register with username/email/password (+ optional phone) and log in with rate-limited credentials.

#### Scenario: Register then login
- **WHEN** a client posts valid `{username, email, display_name, password}` to `/api/v1/auth/register`
- **THEN** it returns 201, duplicate email/username/phone returns 409 with field code, and login returns short-lived access JWT + rotating refresh token

#### Scenario: Brute-force guard
- **WHEN** logins fail 10 times for an account
- **THEN** the account locks for 15 minutes and login errors stay generic (`INVALID_CREDENTIALS`)

### Requirement: Google OAuth login and account linking
Google ID tokens with verified email create or link accounts.

#### Scenario: Link existing email
- **WHEN** a Google token email matches an existing user
- **THEN** the `google_sub` links and login succeeds; unverified Google email is rejected with `GOOGLE_EMAIL_UNVERIFIED`

### Requirement: Session and account management
Clients can refresh, logout (revoke), reset via email link (15-min single-use), change password, update profile, and delete account only with zero nets everywhere.

#### Scenario: Delete blocked by debt
- **WHEN** a user with any non-zero group net requests deletion
- **THEN** it returns 422 listing the blocking groups

### Requirement: Derived contacts with autocomplete
Contacts are co-members of >=1 group, searchable by name/username/email under 200ms p95.

#### Scenario: Auto-contact on join
- **WHEN** user B joins a group containing user A
- **THEN** `GET /api/v1/contacts?q=` immediately returns each to the other
