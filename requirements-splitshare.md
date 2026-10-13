# SplitShare — Requirements Specification V1 (Locked)

## Locked decisions (2026-10-13)
1. **1 currency per group** — set at creation, immutable after first expense. No FX, no cross-currency sum.
2. **Any member can invite** — only owner can remove members, rotate invite, delete group.
3. **Lock at group-fully-settled** — expenses stay OPEN while any net != 0. When all nets == 0, all OPEN expenses + payments in group become LOCKED.
4. **Email only for now** — no SMS. Invites via email + copyable link. No SMS provider needed.

## 1. Auth (FR-1)
- Register: `username` [3-30, a-z0-9_.-, unique case-insensitive], `email` (unique), `phone` optional free-text (not verified, not used for invites V1), `display_name` [1-50], `password` [min 8, 1 letter + 1 digit].
- Google OAuth with email: link if email exists, else auto-create (derive username, no password). Reject unverified Google email.
- Login/logout/refresh/forgot-reset (15-min single-use link)/change-password/profile/delete-account (blocked if any group net != 0).
- Tokens: access JWT 15 min + rotating refresh 30d. Web: httpOnly cookie. Mobile: Keychain/Keystore. Rate-limit login 5/min/IP.

## 2. Contacts (FR-2)
- Derived: A sees B iff share >=1 active group. `GET /contacts?q=&limit=20` searches display_name/username/email, <200ms p95.
- New group co-member appears immediately in contacts. Leave/remove all shared groups => disappears.

## 3. Groups + Invites — email only (FR-3/FR-4)
- `POST /groups {name 3-50 chars, currency ISO-4217 default USD, member_ids[], invite_emails[]}`. Max 50 members/group, 200 groups/user.
- On create: generate `invite_token` (32B random) + `invite_link https://app.../g/<token>`. Never expires until owner rotates: `POST /groups/:id/rotate-invite`.
- Invite paths: (a) `POST /groups/:id/members {user_ids[]}` from contacts, any member allowed; (b) `POST /groups/:id/invites {emails[]}` any member allowed. System emails link. No SMS.
- Pending invites bound to email, auto-consumed on register with matching email within 30 days.
- Join: `POST /groups/join {token}` requires login. Idempotent if already member. Rotated/unknown token => 410 `INVITE_ROTATED` / 404.
- Remove: `DELETE /groups/:id/members/:uid` owner-only, blocked if target net != 0 => 422 `HAS_OPEN_BALANCE`. Leave: same rule. Removed user shown as `Name (removed)`, keeps history, cannot add new.
- Delete group: owner-only, only if zero expenses OR fully settled. Else 422.
- Web: 3-step wizard + copy-link button. Mobile: same + native share sheet (email/message apps, no direct SMS integration).

## 4. Receipts + Split (FR-5/FR-6)
- `POST /groups/:id/expenses {title 1-100, description <=1000, amount decimal string >0 <=1000000.00, payer_id (must be active member), split_type, participants[1..50 active members], splits_detail}`.
- Images: 0..5 per expense, each <=10MB, jpg/png/webp/heic. Two-phase (create draft -> attach -> commit) or atomic with Idempotency-Key. Signed URLs 15-min TTL. Strip EXIF GPS.
- Split types, server-computed (source of truth):
  - EQUAL: floor(total/n), remainder 1c to first r sorted by user_id asc. UI must show who gets +1c.
  - EXACT: sum == total else 422 + diff.
  - PERCENT: sum == 100.00 (2 decimals), largest-remainder to cents.
  - SHARES: shares 1..1000, largest-remainder.
  - Invariant: sum(shares) == total. `POST /expenses/preview-split` for live UI, no persist.

## 5. Minimize transfers (FR-7) — most important
- Scope: per group, OPEN ledger only. Recompute synchronously on every expense/payment mutation. Store `SettlementPlan{version_seq, computed_at, inputs_hash, transfers[], explanation}`. Keep history 100/group.
- Algorithm (normative):
  1. net[u] = paid - owed + paid_out - received (cents). sum(nets)==0 invariant.
  2. Debtors asc (most negative first), creditors desc, tie user_id asc.
  3. Greedy: head d + head c, x=min(-net[d],net[c]), emit d->c:x, update, repeat. Result <= n-1 transfers.
- Example must pass: B->A 10, C->B 10 (nets A+10,B0,C-10) => single C->A 10.
- Explanation collapsible (web+mobile same content): collapsed header `Optimized: 5 debts -> 2 transfers (saved 3) • v12 • Why?`. Expanded: nets-before table, numbered plain-language steps with names+amounts, final transfers with Pay buttons, inputs_hash+version+timestamp, raw-debts toggle. Empty => `All settled — nets $0.00`. History versions read-only with diff.
- No cross-group netting. Stale plan_version on pay => accept + recompute, return `superseded:true`.

## 6. Edit + Resplit (FR-8)
- OPEN editable by creator or owner: all fields + images. `PATCH /expenses/:id {...+expected_version}` optimistic locking; mismatch => 409 `STALE_VERSION`.
- On edit: recalc splits, bump version, append `ExpenseAudit{actor,diff,at}`, recompute settlement.
- Delete: soft-delete, creator/owner, OPEN only. LOCKED => 403 `EXPENSE_LOCKED`. Correction => `Create correction` prefilled reversed expense.
- **Un-settle rule:** edit/delete of OPEN expense is allowed even if some member `net==0`. This recomputes nets and may move `0 -> +/-X` (user un-settles). API must return `unsettled_user_ids[]` in PATCH/DELETE response. Client must show warning modal before confirm if preview shows any `net==0 -> non-zero`: `This will un-settle A (currently $0.00 → -$15.00). Continue?` with affected list. On success: push + email to all affected `0 -> non-zero` users with `actor, diff, new net`, new `SettlementPlan` version, dashboard updates.
- **Frozen removed-member rule:** if expense `payer_id` or any `participant` is a removed/former member, `PATCH/DELETE` => 422 `INVOLVES_REMOVED_MEMBER` + `member_ids[]`. To edit, owner must re-add user first (`POST /groups/:id/members`). New expenses cannot include removed members. Rationale: prevents retroactive debt for someone who left with net==0.

## 7. Pay / Settle + Lock (FR-9)
- `POST /groups/:id/payments {from,to,amount_cents,method: cash|transfer|other, note<=280}`. from!=to, both current/former members, amount>0 and <= debtor's max owed (return max on 422 OVERPAYMENT). Recorder must be from, to, or owner. Idempotency-Key required.
- Effect: nets update, expenses untouched. Partial allowed.
- Settled: net[user]==0. Fully settled: all nets==0 => lock all OPEN expenses+payments in group (immutable snapshot, badge `Settled`). Reverse: owner-only, 24h, only if group not fully locked since; else create counter-payment.

## 8. Ledger + Views (FR-10/FR-11)
- `GET /groups/:id/ledger?type=&q=&sort=-created_at&page=` visible to active members fully; removed members see snapshot up to removal + own payments only. Row: type, title, date, payer/payee avatars, amount, my share, OPEN/LOCKED, thumbnail. Detail: splits table + images + audit + settlement version link. Filters: title/payer/amount/date/status.
- By group: `GET /groups/:id/me {net_cents, owes[{to,amount}], owed_to_me[{from,amount}]}`. Header: You owe / You are owed / Settled.
- All groups: `GET /me/balances {groups[{group_id,name,currency,net_cents}]}` grouped by currency, never summed across currencies. Flag >30d unsettled.

## 9. API list V1
```
POST /api/v1/auth/register, /auth/login, /auth/google, /auth/refresh, /auth/logout, /auth/forgot, /auth/reset
GET/PATCH/DELETE /api/v1/me
GET /api/v1/contacts?q=
POST /api/v1/groups, GET /api/v1/groups, GET/PATCH/DELETE /api/v1/groups/:id
POST /api/v1/groups/:id/members, DELETE /api/v1/groups/:id/members/:uid
POST /api/v1/groups/:id/invites, POST /api/v1/groups/join, POST /api/v1/groups/:id/rotate-invite
POST /api/v1/groups/:id/expenses, GET /api/v1/groups/:id/ledger
GET/PATCH/DELETE /api/v1/expenses/:id, POST /api/v1/expenses/preview-split
POST /api/v1/expenses/:id/images, DELETE /api/v1/images/:id
POST /api/v1/groups/:id/payments, POST /api/v1/payments/:id/reverse
GET /api/v1/groups/:id/settlement, GET /api/v1/groups/:id/settlement/history
GET /api/v1/groups/:id/me, GET /api/v1/me/balances
```
Errors: VALIDATION, UNAUTH, FORBIDDEN, NOT_FOUND, CONFLICT, STALE_VERSION, OVERPAYMENT, HAS_OPEN_BALANCE, EXPENSE_LOCKED, GROUP_FULL, ALREADY_SETTLED, INVITE_ROTATED, INVOLVES_REMOVED_MEMBER. OpenAPI 3.1 required.

## 10. Web/Mobile parity + NFR
- Parity on FR-1..11. Web: responsive 360-1280px, a11y (aria-expanded on settlement box), drag-drop upload, /g/<token> auto-join. Mobile: biometric login, push (invite/expense/payment/settlement change + un-settle alert, per-group opt-out), camera+compress, offline draft expense/payment queue with auto-sync, deep link splitshare://g/<token> + https link, badge for total owed.
- Edit flow (both): `preview-split` before save must include `unsettled_preview[]`; if non-empty, blocking confirm modal with list. After save, toast `Settlement updated v7 → v8, A un-settled` + link to settlement Why-box.
- Security: TLS, Argon2id/bcrypt, signed URLs, PII redaction. Reliability: sum(nets)==0 in DB txn. Perf: contacts <200ms, ledger <500ms p95 @1000 rows. Audit retained 2y.

## 11. Edge cases (must test)
Duplicate email/username; Google link; pending-email auto-join; rotated link 410; amount 0/-5/10.001 reject; EXACT/PERCENT mismatch with diff; 10/3 penny determinism; payer non-member reject; stale version 409; LOCKED edit 403; overpay + double-pay race; remove with balance block; delete unsettled group block; B->A/C->B => C->A optimization; fully-settled empty plan + lock; removed-member snapshot; multi-currency no-sum; image size/mime + EXIF strip; offline no-duplicate via Idempotency-Key; partial-settle then edit un-settles A (modal + push + v+1); edit expense involving removed member => 422 INVOLVES_REMOVED_MEMBER.
