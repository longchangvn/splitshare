# Tasks: Anonymous group (guests without login)

Design + open decisions: `plan.md` (same folder). **Status: pending — not started.**

## How to resume (read first)

1. Read root `AGENTS.md`, `web/AGENTS.md`, then `plan.md`.
2. Confirm open decisions D1–D8 (`plan.md` §8) with Alex; record them in "Decisions log".
3. Find the first task that is `[~]` (resume it) or else the first `[ ]` task whose
   "Start when" is true.
4. Mark `[~]` when starting, `[X]` only after its "Verify" ran and passed. Append a short
   dated log line under the task whenever you stop mid-task.
5. Do not overwrite Alex's unrelated uncommitted changes (`git status` before editing).
6. Cross-stack: freeze the API contract (T2) before web/mobile work starts.

Status: `[ ]` not started · `[~]` in progress · `[X]` done · `[!]` blocked (say why).

Verify suite:
```sh
dotnet build SplitShare.sln
dotnet test tests/SplitShare.Tests.csproj
node --test web/test/*.test.mjs
npm --prefix web run build
npm --prefix mobile test        # sync-shared --check + mapping-check + node --test
```

Decisions log:
- (none yet)

---

## Phase 0 — decisions + contract

- [ ] T0 Confirm D1–D8 with Alex; record above.
- [ ] T1 Write the API contract (endpoints, request/response, error codes, token claims) in
      `contract.md` in this folder: `POST /groups` `is_anonymous`; owner `PATCH` settings;
      `POST /groups/{id}/guests` (name, optional email); `DELETE /groups/{id}/guests/{uid}`;
      `POST /groups/{id}/guests/{uid}/reset`; `POST /groups/{id}/guest-link/rotate`;
      public `GET /guest/join/{linkToken}` (preview + unclaimed seats),
      `POST /guest/join/{linkToken}` (new name or seat id → guest token),
      `POST /guest/seat/{seatToken}` (email link → guest token), `POST /guest/refresh`.
  - Start when: T0 `[X]`.
- [ ] T2 Freeze contract (review with Alex).

## Phase 1 — backend data + auth

- [ ] T3 Model + migrations (**both** Postgres and SqlServer, like existing migrations):
      `User.IsGuest`; `Group.IsAnonymous`, `Group.GuestLinkToken`; `GuestSeat` (or
      `GroupMember` columns) with `SecretHash`, `ClaimedAt`, `LastSeenAt`, `InviteTokenHash`;
      role `guest`.
  - Verify: migrations apply on both providers; `SqlServerMigrationTests` passes.
- [ ] T4 Guest token issuance + refresh (`TokenService` claims `guest`, `gid`); device secret
      hashed; guest scope policy: guest tokens only reach endpoints marked guest-allowed and
      only for `gid`. Exclude guests from login/OTP/reset/contacts search.
  - Verify: new `tests/GuestAuthTests.cs` (cross-group access 403, non-allowed endpoint 403,
    revoked seat 401, rotated link 404).
- [ ] T5 Rate-limit policies `guest-ip` / `guest-user` in `Program.cs`.

## Phase 2 — backend features

- [ ] T6 Anonymous group create/toggle (owner only) in `GroupService`; switching off revokes
      seats (D7).
- [ ] T7 Guest management: add by name, add by email (+ `EmailTemplates.GuestInvite`, D2
      branch for registered emails), remove, reset seat, rotate guest link.
- [ ] T8 Public join endpoints: preview with unclaimed seats (names only, no emails), join as
      new / claim seat, email seat link; respect `JoinBlockerAsync` and `MaxMembers`.
- [ ] T9 Expense rules: guest = creator-only (existing `GuardAsync`); owner override for
      locked expenses / locked groups per D3 with audit entry; guest payments/comments per D4;
      receipt upload per D5.
  - Verify: extend `ExpenseTests.cs` / new `AnonymousGroupTests.cs` (guest edits own OK,
    others' 403; owner edits any incl. locked per D3; ledger nets sum to 0 with guests).
- [ ] T10 Notifications per D6 (skip push for guests; email only with a real address).

## Phase 3 — web

- [ ] T11 Guest session in `web/src/api.js` + per-group token store; routes `/a/:token`,
      `/j/:token` in `App.jsx`; join page (pick/new name).
  - Start when: T2 `[X]`.
- [ ] T12 Guest mode for `GroupDetail` / expense form / expense detail (reuse components; hide
      owner-only and account-only UI; disable edit/delete on others' expenses using
      `created_by`).
- [ ] T13 Owner UI: anonymous toggle in new-group wizard + settings; invite dialog "Add guest
      by email" / "Add guest by name" / "Copy guest link" / rotate / remove / reset seat;
      bearer-link warning. i18n en + vi.
  - Verify: web tests (source wiring + pure helpers) + build; manual run in two browsers
    (owner + guest incognito).

## Phase 4 — mobile

- [ ] T14 Deep links `/a/`, `/j/` → guest join; guest session in SecureStore scoped to one
      group; guest mode on group/expense screens; owner management UI. Shared helpers via
      `mobile/scripts/sync-shared.js`.
  - Verify: `npm --prefix mobile test`; device test.

## Phase 5 — claim + polish

- [ ] T15 Claim flow: guest registers or logs in → merge guest `UserId` into the account
      (transactional, audited); banner in guest view.
  - Verify: tests for claim with matching email, different email, guest in one group only.
- [ ] T16 E2E (`tests.e2e`): owner creates anonymous group → guest joins by link → adds
      expense → cannot edit owner's expense → owner edits guest's expense.
- [ ] T17 Docs: README, `RELEASE_NOTES.md`, privacy note on bearer links.
