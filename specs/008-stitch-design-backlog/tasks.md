# Tasks: Stitch design backlog (deferred from the SplitEase reskin, 2026-11-16)

**Status**: Pending — not started. Owner: Alex (human) + coding agents.
**Source**: Google Stitch project "Bill Splitter Mobile UI" (`projects/456472770257980110`,
59 screens: 12 desktop, 47 mobile). These items appear in the design but were left out of the
reskin because they need backend work, duplicate an existing function, or are decorative.
The "Design ref" on each task is the Stitch screen title.

**Start when (whole file)**: the SplitEase reskin (web + mobile) is merged. Until then, do
not start any task here.

Conventions are the same as `specs/006-product-roadmap/tasks.md` (read its "How an agent
uses this file" section): status legend `[ ]` `[~]` `[X]` `[!]`, tags `[HUMAN]`,
`[DECISION]`, standard verify suite. Every API change needs both Postgres and SQL Server
migrations, en + vi strings on both clients, and `mobile/scripts/mapping-check.js` kept in
sync. Tasks are not ordered by priority; Alex picks.

---

## A. Needs backend work

### Auth and account

- [ ] A1 [DECISION] Apple and Facebook sign-in.
  - Design ref: Login, Register, SplitEase Web - Responsive Login & Register Portal.
  - Today: Google only (`usesAppleSignIn: false` in `mobile/app.json`).
  - Needs: provider apps/credentials `[HUMAN]`, API token verification, buttons on both clients.
  - Decision needed: which providers, if any.

- [ ] A2 Default currency per user and currency choice at sign-up.
  - Design ref: Register ("Primary split currency"), Profile & Settings ("Default Currency").
  - Today: `DEFAULT_CURRENCY` is hard-coded on both clients.

### Groups

- [ ] A3 Currency picker when creating a group.
  - Design ref: Create Group ("Default Currency").
  - Today: group currency is fixed to the default at creation and cannot be changed.
  - Depends on: A2 for the user default.

- [ ] A4 Group badge (emoji) and group category (Trip / Home / Couple / Other).
  - Design ref: Create Group ("Choose group badge", "Category").
  - Today: name only; avatar is generated pastel initials. API returns `cover_url` but no
    client can set it.

### Expenses

- [ ] A5 Multiple payers on one expense.
  - Design ref: Add Expense ("Multiple" payer chip), Web Add Expense & Splitter
    ("Custom multiple payers?").
  - Today: single payer on both clients and in the API.

- [ ] A6 Itemised line-item splitting after a receipt scan.
  - Design ref: Scan Receipt, Add Expense - Izakaya Torishin (Receipt Imported),
    SplitEase Web - Responsive Scan & Splitter.
  - Today: one receipt becomes one expense; no per-item assignment.
  - **Already planned** as `specs/006-product-roadmap/tasks.md` R3.4 (API) and R3.5 (UI).
    Do it there and tick this when R3.5 is `[X]`; do not duplicate.

- [ ] A7 Expense notes and tags.
  - Design ref: Web Add Expense & Splitter ("Notes & Group Tags").
  - Today: expenses have a title only; payments have a note.

- [ ] A8 [DECISION] Live FX conversion.
  - Design ref: Add Expense ("Smart currency", "≈ ¥22,275 JPY"), Web Add Expense ("FX Live Peg").
  - Today: FX is a manual original-amount + rate entry under Bill details.
  - Decision needed: rate source (paid API or free feed) and whether rates are locked at save.

- [ ] A9 [DECISION] Card / bank transaction import.
  - Design ref: Web Add Expense & Splitter ("Import Card / Bank").
  - Needs a bank-data provider; large scope. Compare with roadmap R4 (Splitwise CSV import)
    before committing.

### Invites and members

- [ ] A10 Pending invitations list with resend and revoke.
  - Design ref: SplitEase Web - Responsive Invite & Member Management ("Pending Invitations").
  - Today: the API has `POST /groups/{id}/invites` and token lookup/accept only; no list,
    resend or revoke endpoint, and clients show send results once.

- [ ] A11 [DECISION] Invite roles (viewer / editor / co-admin), admin approval to join, link expiry.
  - Design ref: Invite Members, Web Invite & Member Management, Web Group Settings & Governance.
  - Today: roles are owner / treasurer / member; links do not expire and join is automatic.
  - Decision needed: which roles and what each may do.

### Settle up

- [ ] A12 Named payment methods (Venmo, Zelle, PayPal) with launch links.
  - Design ref: Settle Up, SplitEase Web - Responsive Settle Up Modal.
  - Today: method is cash / transfer / other; handles are free text.
  - **Already planned** as roadmap R2.1–R2.3. Do it there; tick this when R2.3 is `[X]`.

### Cross-cutting

- [ ] A13 Global search (transactions, groups, notes).
  - Design ref: top bar on every desktop screen.
  - Today: search exists only inside a group ledger.

- [ ] A14 Notification bell / in-app inbox, and per-type notification preferences.
  - Design ref: bell icon on Dashboard & Activity and desktop top bar; Profile & Settings
    ("Expense alerts", "Settlement nudges", "Group invites").
  - Today: push with per-group opt-out on mobile (`SystemScreen.js`); web has no settings UI;
    no inbox on either client.

### Export and archive

- [ ] A15 PDF statement package generated by the server.
  - Design ref: Export Trip Summary & Tax Receipts PDF, PDF Package Downloaded.
  - Today: web prints `ReportPrintDoc` via `window.print()`; mobile has CSV export only
    (`GET /groups/{id}/export.csv`).

- [ ] A16 In-app PDF viewer.
  - Design ref: PDF Viewer - Tokyo Trip 2025 Statement, Web Archived Ledger & PDF Viewer.
  - Depends on: A15.

- [ ] A17 Send statement by email / OS share sheet, with a "sent" confirmation.
  - Design ref: Send Final PDF via Email / AirDrop, Transmission Complete - Statement Sent.
  - Depends on: A15. Note: "AirDrop device scanning" in the design is not a real API; use the
    OS share sheet.

- [ ] A18 [DECISION] Tax-deductible summaries.
  - Design ref: Web Archived Groups & Tax Vault ("Tax Deduction Summary"), Archived Groups.
  - Needs a per-expense deductible flag and reporting. Decision needed: whether this is in
    scope for the product at all (see section C on compliance claims).

---

## B. Same function already exists (design shows it as a separate screen)

- [ ] B1 [DECISION] Separate "Split Method & Participants" screen on mobile.
  - Design ref: Split Method & Participants.
  - Today: the split editor is a section inside the add-expense form (restyled in the reskin).
  - Decision needed: keep inline, or move to its own screen.

- [ ] B2 [DECISION] "Re-Split Audit Breakdown" screen after removing a member.
  - Design ref: Re-Split Audit Breakdown, Remove Member & Re-Split.
  - Today: the per-expense before → after breakdown is shown in the removal confirm
    modal/sheet, before removal. Nothing is stored afterwards, so a post-removal audit screen
    would also need the API to persist the re-split result.

---

## C. Decorative claims in the design (recommended: do not build)

- [ ] C1 [DECISION] Confirm these stay out, or say which to build for real:
  - "Cryptographic seal", SHA-256 / Merkle root / block hash text.
  - SOC-2, IRS §274, Japan NTA and "7-year retention" compliance statements.
  - OCR match percentages and "99.4% parsing accuracy".
  - Engine/version badges ("v2.4", "AI Vision Engine v3.2", "Settlement Cycle v2").
  - User-count and volume claims ("18k+", "$12M settled", "120k+ splitters").
  - QuickBooks / Xero sync, "multi-sign dispute window", trip highlights / route map.
  - Reason: none are backed by the product; shipping the compliance and usage claims as
    text would be false statements to users.
