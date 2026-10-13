## Purpose

Shared API foundation for all SplitShare V1 endpoints: versioning, errors, docs, persistence, and safe retries. This underpins every other capability in this change.

## ADDED Requirements

### Requirement: API versioning and standard error envelope
All V1 endpoints live under `/api/v1/*` and return errors as `{code, message, fields}` with stable codes.

#### Scenario: Versioned routing
- **WHEN** a client calls any V1 endpoint
- **THEN** it is served under `/api/v1/*` and OpenAPI 3.1 is published at `/openapi.json`

#### Scenario: Standard error shape
- **WHEN** validation/auth/domain rules fail
- **THEN** the response is `{code, message, fields?}` with one of `VALIDATION, UNAUTH, FORBIDDEN, NOT_FOUND, CONFLICT, STALE_VERSION, OVERPAYMENT, HAS_OPEN_BALANCE, EXPENSE_LOCKED, GROUP_FULL, ALREADY_SETTLED, INVITE_ROTATED, INVOLVES_REMOVED_MEMBER`

### Requirement: EF Core migrations for schema management
Schema changes ship as EF Core migrations applied at startup; `EnsureCreated` is removed.

#### Scenario: Clean database boot
- **WHEN** the API starts against an empty `module_platform` database
- **THEN** migrations apply automatically and `/db-ping` returns `ok`

### Requirement: Idempotent money mutations
`POST` expense/payment endpoints accept `Idempotency-Key` and replay the original response on duplicate delivery.

#### Scenario: Offline retry
- **WHEN** a mobile client retries `POST /api/v1/groups/:id/payments` with the same key
- **THEN** exactly one payment exists and the second response equals the first
