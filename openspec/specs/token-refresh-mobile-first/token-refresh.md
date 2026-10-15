## Purpose

Keep users signed in across access-token expiry without logging out, using the existing rotating refresh tokens. Web client behavior only.

## ADDED Requirements

### Requirement: Transparent retry on 401
Any non-auth request receiving 401 refreshes once with the stored refresh token, stores the new pair, and retries the original request exactly once.

#### Scenario: Expired access, valid refresh
- **WHEN** `GET /api/v1/groups/:id` returns 401 with a live refresh token stored
- **THEN** the client posts `/auth/refresh`, retries the GET with the new token, and the caller never sees the 401

#### Scenario: Dead refresh still logs out
- **WHEN** the refresh call itself returns 401/422
- **THEN** tokens are cleared and the user lands on `/login` (unchanged behavior)

#### Scenario: Auth endpoints never trigger refresh
- **WHEN** `/api/v1/auth/login` returns 401 (wrong password)
- **THEN** the error surfaces directly with no refresh attempt and no retry loop

### Requirement: Single-flight refresh dedupe
Concurrent 401s share one refresh call; all waiters retry with the same new pair.

#### Scenario: Dashboard mount at expiry
- **WHEN** 3 parallel requests 401 simultaneously
- **THEN** exactly 1 refresh request is issued and all 3 originals succeed
