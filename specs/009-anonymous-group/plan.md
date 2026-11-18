# Plan: Anonymous group (guests without login)

**Created**: 2026-11-17 · **Status**: Pending (not started) · **Tasks**: `tasks.md` (same folder)

## 1. Feature (as requested by Alex)

- A registered user (the **owner**) creates an **anonymous group**. The owner must have an account.
- The owner adds **anonymous participants (guests)** in two ways:
  1. **By email**: the guest gets a personal link and opens the group with no login.
  2. **Shareable group link**: anyone with the link opens the group with no login.
- Guests: no login. They can view the group and **add expenses**, but **cannot change or delete
  expenses added by others**.
- Owner: can add, edit or delete **any** expense **at any time**.

## 2. What exists today (explored 2026-11-17)

| Area | Today | Where |
|---|---|---|
| Group creation | JWT required (owner is always a registered user) | `api/Groups/GroupService.cs` `CreateAsync`; `Program.cs` `api = v1.MapGroup("/").RequireAuthorization()` |
| Members | `GroupMember(GroupId, UserId, Role owner\|treasurer\|member)`, FK to `User` | `api/Models/Entities.cs` |
| `User` | `Email` and `Username` unique and required; `PasswordHash` nullable | `api/Models/Entities.cs` |
| Expense edit rule | Creator, owner or treasurer may modify; locked when `Status != Open`; group must be writable | `api/Expenses/ExpenseService.cs` `GuardAsync` (lines ~111-133) |
| Email invite | `PendingInvite` + hashed token → `/invite/{token}` → user creates an account (password / Google) | `GroupService.InviteEmailsAsync`, `AcceptInvitationAsync`; `web/src/pages/InvitationPage.jsx` |
| Group link | `Group.InviteToken` → `/g/{token}` → **login required** to join | `GroupService.JoinByTokenAsync`; `web` route `/g/:token` |
| Public page | `Group.ShareToken` → `/s/{token}` → **read-only** balances, no auth | `TripPackEndpoints.MapPublic` `/shared/{token}`; `web/src/pages/SharePage.jsx` |
| "Guests" on expenses | `ExpenseGuest` = a label riding on a member's share (e.g. "Kid"). **Not a person who can log in or pay**, so it can't be reused here | `api/Models/TripPack.cs` |
| Tokens | JWT `sub/unique_name/email`; refresh tokens in DB | `api/Auth/TokenService.cs`, `AuthService.IssueTokensAsync` |

So: the edit rule the feature needs (creator only, owner overrides) **already exists**. What's
missing is a guest identity that works without login, and owner override for locked
expenses / read-only groups.

## 3. Key design decision: how a guest is represented

**Recommended (A): guest = a `User` row flagged `IsGuest`, joined as `GroupMember` with role `guest`.**
- Every ledger, split, settlement, payer, activity and statement path keys on `UserId`, so a
  guest that is a real `User` row works with **zero changes** to money logic.
- The guest has no password and no Google/Apple login. Email is optional.
- Later a guest can **claim** their seat: register or log in → merge into the real account
  (same `UserId` kept when the email matches, otherwise move the rows).

Rejected (B): a separate `GroupGuest` table with nullable `UserId` on splits/payer. This
touches `Expense.PayerId`, `ExpenseSplit.UserId`, `Payment`, settlement, ledger, activity and
the statement code, which means a large migration and regression risk.

Schema changes for (A):
- `User.IsGuest bool` (default false). `Email` and `Username` stay unique: guests without an
  email get placeholders `guest-{id}@guest.invalid` / `guest-{id}` (never emailed; filtered
  from contacts search, login, password reset and OTP).
- `Group.IsAnonymous bool` (or `GuestAccess`) and `Group.GuestLinkToken string?` (separate from
  `InviteToken` and `ShareToken`, rotatable by the owner).
- `GuestSeat` (or columns on `GroupMember`): `SecretHash`, `ClaimedAt`, `LastSeenAt`,
  `EmailInviteTokenHash`. This binds a seat to the device that opened it.
- Role value `"guest"` on `GroupMember.Role`.

## 4. Auth model for guests

- **Guest token**: a short JWT with claims `sub=<guest user id>`, `guest=true`,
  `gid=<group id>`, plus a long-lived opaque **device secret** (stored hashed in `GuestSeat`)
  for refresh. Web: `localStorage` per group. Mobile: SecureStore.
- **Scope enforcement on the server** (never trust the client): a guest token may only call
  the allowed endpoints of **its own group** (§5). Implement it as an authorization policy,
  or as a filter that rejects any route without the `guest-ok` metadata and checks
  `route {id} == gid`.
- Rate limits: new `guest-ip` and `guest-user` policies on the public join endpoints and on
  guest writes. Reuse the `AddRateLimiter` pattern in `Program.cs`.
- Rotating `GuestLinkToken` stops new joins. Revoking a seat (owner removes the guest or resets
  the seat) invalidates the device secret.

## 5. Permissions

| Action | Guest | Registered member | Owner |
|---|---|---|---|
| View group, expenses, balances | yes | yes | yes |
| Add expense | yes (as creator) | yes | yes |
| Edit / delete own expense (open) | yes | yes | yes |
| Edit / delete others' expenses | **no** | no (treasurer yes, as today) | **yes, any time** (D3) |
| Upload receipt image on own expense | yes (D5) | yes | yes |
| Record payment / settle up | D4 | yes | yes |
| Invite, remove members, rotate links, settings, lock/close/delete group | no | as today | yes |
| Comments, nudges | D4 | yes | yes |

The rule for others' expenses already lives in `ExpenseService.GuardAsync`. A `guest` role
simply isn't `owner`/`treasurer`, so it falls under the creator-only branch. Owner "any time"
needs a bypass of `EXPENSE_LOCKED` and the group read-only check **for the owner only** (D3).

## 6. Flows

### 6.1 Owner creates an anonymous group
New-group wizard (web `Dashboard` wizard / mobile `NewGroupScreen`) gets a toggle **"Anonymous
group — friends join without an account"**. `POST /groups` gets `is_anonymous: true`, or the
owner turns it on later in group settings (owner only).

### 6.2 Add a guest by email
Owner → Invite → "Add guest by email" (name + email) → server creates the guest `User`
(`IsGuest`, real email, unverified) + `GroupMember(role=guest)` + seat token → sends the email
(`EmailTemplates.GuestInvite`) with `/a/{seatToken}` → guest opens it → server issues a guest
token → the group opens. If that email later registers or logs in, offer **claim** (§6.4).
- If the email already belongs to a registered user: send the normal invite instead (D2).

### 6.3 Shareable guest link
Owner → "Copy guest link" `/j/{guestLinkToken}` → visitor opens it → page shows the group name
and the guest list:
- **"I'm new"**: enter a display name → a guest seat is created → guest token.
- **"I'm <existing unclaimed guest>"**: claim a seat the owner pre-created (by name, no email)
  → bound to this device.
- Claimed seats are hidden from the picker (no impersonation). The owner can **reset** a seat
  if someone loses their device.
- The member limit (`MaxMembers`) and `JoinBlockerAsync` (read-only / full) still apply.

### 6.4 Guest claims an account (optional, later)
A banner in the guest view says "Save your access: create an account". Register or log in with
the token → merge: rows keyed on the guest `UserId` move to the real user, or the guest row is
upgraded in place when it has no other memberships. Wrap it in one transaction and audit it.

### 6.5 Guest UI
- Web: new route `/a/:token` and `/j/:token` → a guest shell that reuses `GroupDetail` /
  `ExpenseForm` / `ExpenseFields` in a **guest mode** (no dashboard, no profile, no other
  groups; hide owner-only actions). Don't fork components (web/AGENTS.md reuse rule).
- `api.js`: send the guest token from the per-group store when there is no user session.
- Mobile: deep links `/a/` and `/j/` → `JoinScreen` variant → guest session scoped to one group.

## 7. Security / privacy notes

- A guest link is a bearer secret: anyone with it can add expenses. Show this warning to the
  owner. Rotating the link and removing guests must be one tap.
- Guests must never see other members' emails. Return names only, as the public share page does.
- Never log tokens. Hash seat, link and device secrets (`TokenService.HashToken`).
- Guests excluded from: contacts search (`AuthService.SearchContactsAsync`), login, OTP,
  password reset, push devices (or allow push only after claim), email notifications unless
  they have a real email (D6).
- Abuse: rate limits, a cap on guests per group, and owner moderation (delete any expense,
  remove a guest).

## 8. Open decisions (confirm before starting)

| # | Decision | Recommended default |
|---|---|---|
| D1 | Guest identity model | (A) `User.IsGuest` + `GroupMember.Role = "guest"` |
| D2 | Email already registered | Send the normal invite (account join); no guest seat |
| D3 | Owner "any time" | Owner may edit/delete even locked (settled) expenses and in locked groups, with an audit entry; closed groups stay read-only unless reopened |
| D4 | Guests and payments/settle/comments | Guests may record payments they are part of and comment; no settle/lock |
| D5 | Guest receipt uploads | Allowed on own expenses, same limits |
| D6 | Notifications for guests | Email only if a real email was given; no push until claim |
| D7 | Can existing (non-anonymous) groups be switched to anonymous? | Yes, owner-only toggle; switching off revokes all guest seats |
| D8 | Guest seat expiry | No expiry; owner can reset or remove. Device secret rotates on refresh |

## 9. Acceptance

- The owner (registered) creates an anonymous group and gets a guest link plus email-guest option.
- A guest opens the link with no account, picks or creates a name, adds an expense, and edits
  or deletes **only their own** expenses (403 on others').
- The owner edits or deletes any expense, including per D3.
- A guest token cannot read or write any other group or any non-allowed endpoint (tested).
- Rotating the link blocks new joins. Removing a guest revokes their device.
- Ledger and settlement show guests like members (sum of nets == 0 invariant holds).
- Web and mobile both supported, i18n in en and vi.
