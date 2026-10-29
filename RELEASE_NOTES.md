# SplitShare v1.0.0 — Release Notes

**Release date:** 2026-10-20
**Status:** First public release

SplitShare is an app for splitting group expenses. Log receipts, split them
however you like, and SplitShare works out the fewest transfers needed for
everyone to settle up, with a plain-language explanation of how it got there.

---

## Highlights

- **Fewest transfers to settle.** A greedy debt-minimization algorithm brings
  a group down to at most n-1 transfers. A "Why?" panel explains each step
  (for example: *5 debts → 2 transfers, saved 3*).
- **Four split types.** Equal, Exact, Percent, and Shares. The server
  calculates every split down to the cent, so results always match.
- **Automatic lock when settled.** Once every balance in a group reaches zero,
  all open expenses and payments become read-only and show a *Settled* badge.
- **Trips, roommates, and events.** Budgets, categories, tax/tip, recurring
  bills, comments, CSV export, statements, and public share links.
- **Web and mobile.** A responsive web app (360–1280px) and an Expo app for
  iOS and Android.

---

## Features

### Accounts & authentication
- Register with username, email, display name, and password. Sign in with
  email/password or **Google**. A Google sign-in links to an existing account
  with the same email, or creates a new one.
- Short-lived access tokens (15 min) with rotating refresh tokens (30 days).
- Forgot/reset password, email verification, profile edit, password change.
- Account deletion is blocked while you still owe or are owed money in any
  group.
- Auth endpoints are rate-limited per IP.

### Groups & invites
- Create groups with a name and one fixed currency (ISO-4217). The currency
  can't be changed after the first expense.
- **Any member can invite**, either from contacts or by email. Each group has a
  shareable invite link (`/g/<token>`) that only the owner can rotate.
- Pending email invites are applied automatically when that person registers.
- Owner-only actions: remove a member, rotate the invite link, delete the
  group. A member can't be removed and can't leave while they have an open
  balance.
- Removed members keep their history and appear as *Name (removed)*.
- Group templates, modes (shared / trip / event), budgets with alerts, flat
  fees, deposits, and a treasurer role.

### Expenses
- Title, description, amount, payer, participants, category, spent-at date,
  and tax/tip/fee lines.
- Up to 5 receipt images per expense (jpg/png/webp/heic, ≤10 MB each). GPS
  location data is removed from uploads.
- Live split preview before saving. Penny remainders are assigned predictably,
  and the UI shows who gets the extra cent.
- Edits use version checks: if someone else changed the expense first, the
  save is rejected (`409 STALE_VERSION`) instead of overwriting their changes.
  Every edit is recorded in an audit trail.
- **Un-settle warning:** if an edit would reopen a balance that was already
  settled, you see the affected members and their new balances before you
  confirm.
- Expenses involving removed members are frozen
  (`INVOLVES_REMOVED_MEMBER`).
- Guest shares, present-only splits, manual FX fields, and copy/duplicate
  expense.
- Recurring expense rules, created automatically when the group is viewed.

### Settlement & payments
- The settlement plan is recalculated on every change and versioned, with the
  last 100 versions kept and viewable with diffs.
- Record payments (cash / transfer / other) with optional proof attachments.
  Partial payments are allowed, overpayment is rejected and the error shows
  the maximum amount owed.
- The owner can reverse a payment within 24 hours.
- Money-related requests accept an `Idempotency-Key`, so retries never create
  duplicates.
- Payment handles: share your payment account details with the group.
- Nudges (rate-limited reminders) for members who owe money.

### Ledger, reports & sharing
- Ledger with filters for type, search text, payer, amount, date, status, and
  category.
- Per-group "You owe / You are owed / Settled" summary. A dashboard across all
  groups, grouped by currency (balances in different currencies are never
  added together), flags balances unsettled for more than 30 days.
- Activity feed, per-member statements, category breakdown and charts, trip
  report, CSV export.
- Read-only public share link for a group.

### Notifications
- Web push via **OneSignal**. Group members (except whoever made the change)
  are notified when an expense or payment is added. Opt in from
  Settings → Notifications; the browser never prompts automatically.
- If notification delivery fails, the expense or payment is still saved.

### Web app
- React 18 + Vite + Mantine. Mobile-first layout: 3-tab group view
  (Expenses / Balances / Activity), one sticky "+ New" button, filter sheet,
  and row menus. The desktop layout keeps the full tab set.
- Loading skeletons and spinner buttons. The invite page joins you to the
  group automatically after you sign in.

### Mobile app (iOS / Android, Expo)
- Covers the core feature set (FR-1 to FR-11): auth (including biometric
  unlock), home balances, group ledger, add/edit expense with camera and
  image compression, settlement explanation, pay/reverse, new group with the
  native share sheet, and profile.
- An offline queue saves expenses and payments made without a connection and
  syncs them when the connection returns, reusing the same Idempotency-Key so
  nothing is duplicated.
- Deep links: `splitshare://g/<token>` and `https://…/g/<token>`.

---

## Platform & infrastructure

| Component | Tech |
|---|---|
| API | .NET 10 minimal API, EF Core, ~70 endpoints under `/api/v1` (snake_case, OpenAPI) |
| Database | **SQL Server** (default) or **PostgreSQL**, chosen by config with no code change; separate migrations for each |
| Web | React 18, Vite 5, Mantine 7, React Router 7 |
| Mobile | Expo SDK 52, React Native 0.76 |
| Local dev | Docker Compose, or .NET Aspire AppHost |
| Hosting | API on Azure Container Apps, web on Azure Static Web Apps |
| CI/CD | GitHub Actions: CI builds run on every push; CD for the API and web is **manual** (`workflow_dispatch`) and syncs GitHub vars/secrets into the container app's environment |

**Quality:** 62 automated tests (xUnit) cover auth, groups, splits, settlement,
ledger, payments, trip-pack features, notifications, provider selection, and
SQL Server migrations. The mobile app has a script that checks each screen
against its API endpoints.

---

## Known limitations

- **Outgoing email is a stub.** `StubEmailSender` only logs messages. Email
  invites, password reset, and verification emails are **not delivered** until
  an SMTP provider is connected.
- **Receipt OCR is off.** `/expenses/ocr` returns `501 OCR_UNAVAILABLE`; the
  `/capabilities` endpoint reports it as unavailable.
- **Mobile app doesn't have the trip-pack features** (budgets, templates,
  handles, comments, recurring, statements, CSV export, share links). These
  are web-only in v1.
- **No mobile push from the server.** The app gets an Expo push token but
  doesn't send it to the API. Server push currently reaches OneSignal web
  subscribers only.
- **FX is manual.** There are no automatic exchange rates, and balances are
  never netted across groups.
- **No in-app money movement.** Payments are recorded, not processed.
- **Uploads use local disk** (`/data/uploads`). On Container Apps, images are
  lost when the container restarts unless a persistent volume or blob storage
  is attached.
- Passwords are hashed with PBKDF2-SHA256. The spec recommends
  Argon2id/bcrypt.

---

## Before publishing: checklist

These came up while reviewing the repo for this release:

- [ ] **Remove secrets and data from git.** `.env.remote` and the database
      dumps (`dump-splitshare-*.sql/.tar`, `splitshare-*-20261017.sql`) are
      tracked even though `.gitignore` lists `.env.remote`. Run
      `git rm --cached` on them, and **rotate** any JWT key or database
      password they contain, because they remain in git history.
- [ ] Set a strong production `JWT_KEY` (≥32 chars) in GitHub secrets.
- [ ] Mobile `app.json`: set `extra.apiUrl` to the production API (it is
      currently `http://localhost:8081`) and set `extra.googleClientId`.
- [ ] Register the production web origin in Google Cloud Console and in
      OneSignal (Site URL).
- [ ] Configure `App:BaseUrl` / `SPLITSHARE_WEB_BASE_URL` so invite links
      point to production.
- [ ] Connect real email delivery, or tell users that email invites and
      password reset aren't available yet.
- [ ] Attach persistent storage for uploads.
- [ ] Line up version numbers: web `package.json` is `0.1.0`, mobile is
      `1.0.0`. Tag the release `v1.0.0`.
- [ ] Finish the open verification tasks in
      `openspec/changes/forward-github-env-to-container-app/tasks.md` (4.1–4.3).

---

## Upgrade / install

First release, so there is nothing to upgrade from. Setup instructions are in
`README.md` (Docker Compose, Aspire, and local dev), with mobile setup in
`mobile/README.md`. Database migrations run against whichever provider
`Database:Provider` selects (see `api/Migrations/README.md`).
