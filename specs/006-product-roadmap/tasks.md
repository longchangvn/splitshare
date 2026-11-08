# Tasks: Product roadmap after v1 (PM review 2026-11-08)

**Status**: Planned — not started. Owner: Alex (human) + coding agents.
**Source**: senior-PM review of the repo on 2026-11-08 (code state + market evidence, see
"Evidence" at the bottom). Priority order: **P0 → R1 → R2 → R3 → R4**.

---

## How an agent uses this file (read first)

1. Read root `AGENTS.md` (and `web/AGENTS.md` for web work) before anything else.
2. Pick the **first task whose status is `[ ]` and whose "Start when" gate is fully true**.
   Check each gate condition yourself (git status, the referenced task's checkbox, a file
   existing, a test passing). If any condition is false, **do not start** — pick the next
   eligible task or stop and report which gate is blocking.
3. Mark the task `[~]` (in progress) in this file when you start, `[X]` only when every
   "Done when" item is true and "Verify" was actually run and passed.
4. Tasks tagged:
   - `[P]` — can run in parallel with other `[P]` tasks of the same phase (disjoint files).
   - `[HUMAN]` — needs Alex: credentials, Azure resources, destructive git ops, paid
     accounts. An agent may prepare commands/PR text but **must not execute** them.
   - `[DECISION]` — needs Alex's answer first. Agent asks (with options), records the answer
     under the task as `Decision: …`, then the task becomes startable.
5. Never start a phase while the previous phase has a task in `[~]` that touches the same files.
6. Standard verify suite (run what is relevant to the files touched):
   ```sh
   dotnet build SplitShare.sln
   dotnet test tests/SplitShare.Tests.csproj
   npm run --prefix web build
   node --test web/test/*.mjs
   npm --prefix mobile test
   ```

Status legend: `[ ]` not started · `[~]` in progress · `[X]` done · `[!]` blocked (write why).

---

## Gate 0 — current work in progress (must be clear before ANY task below)

- [ ] G0 Alex's uncommitted email-verification / OTP work is committed (or explicitly
      abandoned). Files at time of writing: `api/Auth/AuthService.cs`,
      `api/Auth/EmailTemplates.cs`, `api/Endpoints/AuthEndpoints.cs`, `tests/AuthTests.cs`,
      `web/src/pages/AuthPages.jsx`, `web/src/pages/Profile.jsx`, `web/src/styles.css`,
      `web/src/i18n/messages.js`, `mobile/src/**` (AuthContext, AuthScreen, ProfileScreen,
      i18n account, shared messages), `mobile/scripts/mapping-check.js`.
  - **Start when**: n/a (human task).
  - **Done when**: `git status --short` shows none of the files above as modified.
  - Agents: if this is not done, **stop** and tell Alex; do not stash, reset or overwrite.

---

## Phase P0 — launch blockers (do before new features)

**Phase start when**: G0 is `[X]`.

- [ ] P0.1 [HUMAN] Remove tracked secrets/data from git and rotate credentials.
  - Files: `.env.remote`, `dump-splitshare-202610142242.sql`, `dump-splitshare-202610152104.tar`,
    `splitshare-pg-to-sqlserver-20261017.sql`, `splitshare-sample-monthly-test-20261017.sql`
    (contains **plaintext seed passwords**).
  - Agent may: write the exact `git rm --cached …` + `.gitignore` lines and a rotation
    checklist (JWT key, DB passwords, any API key in `.env.remote`). Alex executes.
  - **Start when**: G0 `[X]`.
  - **Done when**: `git ls-files | rg '\.env\.remote|dump-|\.sql$|\.tar$'` returns nothing;
    Alex confirms rotation done. (History rewrite is optional and Alex's call.)

- [ ] P0.2 [DECISION] Choose persistent receipt storage.
  - Options: (a) Azure Blob Storage via `Azure.Storage.Blobs` (recommended, new dependency);
    (b) Azure Files volume mounted at `/data/uploads` (no code change, infra only).
  - **Start when**: G0 `[X]`.
  - **Done when**: `Decision:` line recorded here.

- [ ] P0.3 Implement chosen storage behind existing `IFileStore` (`api/Expenses/FileStore.cs`).
  - If (a): add `BlobFileStore : IFileStore`, select by config `Uploads:Provider`
    (`local` default | `blob`), connection via env/secret only (never `appsettings*.json`),
    keep `LocalFileStore` for dev/tests; add vars/secrets to `.github/workflows/cd-api.yml`
    mapping list (same pattern as `Uploads__Path`) and `docker-compose.yml`.
  - If (b): agent only updates docs/CD; Alex attaches the volume `[HUMAN]`.
  - **Start when**: P0.2 has a `Decision:` line.
  - **Done when**: uploading a receipt, restarting the API container, and re-opening the
    expense still shows the image; unit tests for the new store (fake/in-memory) pass.
  - Verify: `dotnet test tests/SplitShare.Tests.csproj`.

- [ ] P0.4 [P] Update `RELEASE_NOTES.md` "Known limitations": email is no longer a stub
      (SendGrid/SMTP exist in `api/Auth/EmailSender.cs`), mobile push token is now registered
      (`mobile/src/push/notifications.js`), storage per P0.3.
  - **Start when**: P0.3 `[X]`.
  - **Done when**: no statement in Known limitations contradicts the code.

---

## Phase R1 — product analytics & activation funnel (#1 priority)

**Why**: no instrumentation exists; every later priority must be validated with data.
**Phase start when**: P0.1 and P0.3 are `[X]`.

- [ ] R1.1 [DECISION] Analytics approach.
  - Options: (a) **server-side events table** in our DB (recommended: no third-party PII,
    no new SDK, works for web + mobile because all events are API mutations);
    (b) third-party product analytics SDK (e.g. PostHog) on web + mobile.
  - **Done when**: `Decision:` recorded.

- [ ] R1.2 Event contract (doc first, no code): add `specs/006-product-roadmap/analytics-events.md`
      defining exactly these events, their properties (ids only — **no emails, names,
      amounts' descriptions or receipt content**), and the emitting code path:
      `user_signed_up`, `group_created`, `invite_sent`, `invite_accepted`,
      `expense_created` (props: split_type, has_receipt, via_scan), `settlement_viewed`,
      `payment_recorded`, `group_fully_settled`.
  - **Start when**: R1.1 decided.
  - **Done when**: Alex approves the doc (ask).

- [ ] R1.3 Implement emission (if R1.1 = a): `AnalyticsEvent` model + EF config +
      **two migrations (Postgres + SQL Server, see `api/Migrations/README.md`)**; a small
      `AnalyticsService.Track(...)` called from existing services (`AuthService`,
      group/invite services, `ExpenseService`, `SettlementService`, payment service).
      Tracking failure must never fail the user request (same rule as notifications).
  - **Start when**: R1.2 `[X]`.
  - **Done when**: each of the 8 events has a test asserting it is written once per action
    and not duplicated on `Idempotency-Key` retries.
  - Verify: `dotnet test tests/SplitShare.Tests.csproj` (incl. `SqlServerMigrationTests`).

- [ ] R1.4 Funnel report: owner-only/admin endpoint or SQL view returning, per weekly signup
      cohort: activation rate (**group with ≥2 members AND ≥1 expense within 7 days of
      signup**), week-1 and week-4 retention (any tracked event), invite acceptance rate.
  - **Start when**: R1.3 `[X]`.
  - **Done when**: test with seeded events returns hand-computed expected numbers;
    endpoint is not reachable by normal users.

- [ ] R1.5 [HUMAN] Deploy R1 and let it collect **≥ 2 weeks** of data. Record baseline
      numbers here (activation %, W1, W4, invite acceptance %).
  - **Gate for R3 re-ranking** (see R3.0).

---

## Phase R2 — one-tap settle-up: payment deep links + automatic reminders (#2)

**Why**: settlement is the spec's "most important" feature, but the flow ends at "record
payment"; repayment friction is the documented pain (see Evidence).
**Phase start when**: R1.3 `[X]` (so we can measure impact). Does **not** wait for R1.5.

- [ ] R2.1 [P] Typed payment handles. Extend handles (`/me/handles`, model + migrations both
      providers) with `kind`: `venmo | paypal | cashapp | other` + `value`. Existing rows
      → `other` (backward compatible, additive API field). Server validates value format
      per kind.
  - **Start when**: phase gate.
  - **Done when**: contract test shows old clients (no `kind`) still work; new kinds
    validate.

- [ ] R2.2 Pay-link builder (pure, shared logic duplicated per client like `receiptBatch.js`):
      `web/src/payLink.js` + `mobile/src/payLink.js` building a prefilled URL from
      (kind, value, amount, note). **Verify each provider's current public URL format
      before coding** and record the source URL in a code comment. Unknown kind → no link.
  - **Start when**: R2.1 API contract merged (`[X]`).
  - **Done when**: unit tests in `web/test/pay-link.test.mjs` and mobile test suite cover
    each kind, amount formatting (2 dp, group currency), encoding of the note.

- [ ] R2.3 UI: on settlement transfer rows (`web/src/components/SettlementBox.jsx`, Balances
      tab, mobile `SettlementScreen.js` / `PayScreen.js`), when the receiver has a typed
      handle show "Pay with Venmo/PayPal/Cash App" that opens the link, then prompts
      "Did you pay? Record payment" prefilled (existing payment flow + `Idempotency-Key`).
      Never auto-record without confirmation. i18n en + vi on both clients.
  - **Start when**: R2.2 `[X]`.
  - **Done when**: web build + tests, mobile tests and `mobile/scripts/mapping-check.js` pass.

- [ ] R2.4 [DECISION] Reminder policy: cadence (recommend: first reminder 3 days after a
      debt appears, then weekly, max 4), channels (push + email), per-user opt-out location.

- [ ] R2.5 Automatic reminders: `BackgroundService` (none exists yet) that finds open debts
      per policy and sends via existing `GroupNotifier` / email sender. Must be safe with
      **multiple API replicas** (Container Apps): use a DB row lease or an idempotent
      "reminder sent" record keyed by (debt, reminder_no). Reuse nudge rate limits.
      Respect per-group mute (`/me/devices`) and new opt-out.
  - **Start when**: R2.4 decided AND R2.1 `[X]`.
  - **Done when**: tests cover: no duplicate send across two concurrent runs, opt-out
    respected, stops when debt settled, email/push failure doesn't crash the job.

- [ ] R2.6 Metrics: add to R1.4 report — median hours from debt created → settled, % groups
      reaching fully settled within 30 days. Compare to R1.5 baseline after 2 weeks.
  - **Start when**: R2.3 and R2.5 `[X]`.

---

## Phase R3 — finish receipt scanning, then itemization (#3)

**Phase start when**: P0.3 `[X]` (receipts must survive restarts).
R3.1–R3.2 may run in parallel with R2 (disjoint files); R3.3+ waits for R3.2.

- [ ] R3.0 Re-rank check: if R1.5 data shows <10% of expenses use receipts AND R4 demand is
      higher, ask Alex whether to swap R3 and R4. Record decision.

- [ ] R3.1 [HUMAN] Provider access: paid OCR model/key (Gemini Flash via OpenAI-compatible
      endpoint per `specs/004-multi-receipt-expenses/continuation-plan.md`). Put key in
      `.env` / GitHub secret `OCR__APIKEY` only.
  - Unblocks `specs/004-multi-receipt-expenses/tasks.md` V12.

- [ ] R3.2 Accuracy gate: run live test (`OCR_LIVE_TEST=1 dotnet test tests --filter
      ReceiptScanLiveTests`) plus a ≥30-receipt set; **total correct ≥ 85%** (spec 004
      T002 gate; local spike was 50%). Record results in spec 004 `research.md`.
  - **Start when**: R3.1 done.
  - **Done when**: gate met. If not met → `[!]` and stop R3; report to Alex.

- [ ] R3.3 Finish batch scan: remaining open tasks in `specs/004-multi-receipt-expenses/tasks.md`
      and `continuation-plan.md` (Phase 3 mobile + Phase 4 live E2E). That file is the task
      source of truth for this step.
  - **Start when**: R3.2 `[X]`.

- [ ] R3.4 Itemization API: extend `ReceiptSuggestion` (`api/Expenses/OcrService.cs`) with
      optional `items[] {name, qty, amount}`; `ReceiptParser` validates (sum of items +
      tax/tip ≈ total, else warning, never 500). Additive DTO field on
      `POST /groups/{id}/expenses/scan`; older clients ignore it.
  - **Start when**: R3.3 `[X]`.
  - **Done when**: parser tests with fixtures incl. mismatched sums and missing items.

- [ ] R3.5 Itemization UI (web first, then mobile): "Assign items" step after scan — tap items
      per participant, shared items split among selectors, tax/tip/fee distributed
      proportionally; result submitted as an **EXACT** split (server remains source of
      truth via `preview-split`). Pure helper `web/src/itemAssign.js` with tests.
  - **Start when**: R3.4 `[X]`.
  - **Done when**: penny-exact tests (sum == total, deterministic remainder), web build,
    mobile tests + mapping check pass.

- [ ] R3.6 Metrics: % expenses created via scan, % scans with itemization, scan-to-save
      edit rate (fields changed by user).

---

## Phase R4 — import from Splitwise CSV (#4, acquisition)

**Phase start when**: R1.3 `[X]` (to measure imports) AND R4.1 done.

- [ ] R4.1 [HUMAN] Provide 2–3 real Splitwise group CSV exports (anonymized) into
      `tests/fixtures/splitwise/`. **Do not guess the format.**
- [ ] R4.2 Parser (pure) + `POST /groups/import/splitwise` (multipart): map members by
      name → existing contacts or pending email invites; expenses → EXACT splits;
      payments → payments; currency must match a single group currency (else 422 with
      list). Idempotent by file hash.
  - **Done when**: fixtures import with net balances equal to the CSV's final balances
    (sum(nets) == 0 invariant holds).
- [ ] R4.3 Web UI: "Import from Splitwise" in New group wizard with preview (members,
      expense count, resulting balances) before commit. i18n en + vi.
  - **Start when**: R4.2 `[X]`.
- [ ] R4.4 Metric: imports per week, % imported groups with a new expense within 14 days.

---

## Deprioritized (do not start without Alex re-prioritizing)

- `openspec/changes/guest-split-method` (25 open tasks; niche edge case).
- New trip-pack breadth features, dark theme on mobile (accepted gap G-2).
- Further CI/CD polish beyond what P0/R-tasks require (~1/3 of commits already touch
  `.github/`).

---

## Evidence (summary of the 2026-11-08 review)

Code facts:
- No analytics SDK or event tracking in `api/`, `web/src`, `mobile/src`.
- Receipts stored on local disk (`LocalFileStore`, `/data/uploads` in CD).
- `ReceiptSuggestion` has total/merchant/currency/date only — no line items.
- Payment handles are free text; no `BackgroundService` (reminders are manual nudges).
- Local OCR spike: total correct 50% (gate is 85%).
- Repo: 134 commits since 2026-10-13, 44 touch `.github/`.

Market (third-party; methods differ, treat as directional):
- Finance app D30 retention 2%–17.6% depending on source (Adjust, Business of Apps,
  Airship); ~14% of finance users complete activation by day 30 (Business of Apps).
- 46% of UK adults too awkward to ask for money back; ~2 months to be repaid
  (Starling Bank / Opinium, n=2,000, 2023). >60% find asking awkward (Circle, n=3,000+).
- Venmo: 67M monthly active accounts, 31 transactions/account (PayPal Q4-2025).
- Splitwise free tier: 4 expenses/day; receipt scanning + itemization are Pro-only
  ($4.99/mo, $39.99/yr US) — kb.splitwise.com/pro/what-is-splitwise-pro.
- 80% of diners chose paying for their own order (Gneezy et al. 2004, n=24 — small);
  34% accept an equal split to avoid looking stingy (OpenTable UK 2016).
