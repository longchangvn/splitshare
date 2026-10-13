## Context

Skeleton today: .NET 10 minimal API with `/health` + `/db-ping`, EF Core + Npgsql with `User/Group/GroupMember` entities and `EnsureCreated`, React+Vite status page, 3-service compose verified against local Postgres `localhost:5433`. No auth, ledger, or settlement code exists.

## Goals / Non-Goals

**Goals:**
- One versioned API serving web and future mobile with identical semantics.
- Money math exact in integer cents with `sum(nets)==0` enforced per mutation transaction.
- Settlement explainable: every plan version carries its derivation steps.
- Incremental shippability: foundation → settlement core → auth/groups → expenses/payments → views → web.

**Non-Goals:**
- Mobile apps, OCR, real bank rails, multi-currency/FX, SMS (per locked decisions).
- Global optimality proof for min-cash-flow (NP-hard); greedy + documented bound instead.

## Decisions

1. **Minimal-API + service layer** (not controllers): `SettlementService` as pure static core (nets → transfers + steps) for unit testing; EF orchestration in `LedgerService`. Rationale: optimizer must be testable without a database; alternatives (stored procedures) hurt portability.
2. **Migrations replace EnsureCreated** at the first model change; startup applies migrations inside a try/catch that preserves `/health` when DB is down.
3. **JWT (15-min access + 30-day rotating refresh, httpOnly cookie on web)** over sessions table; Google login links by verified email. Rationale: stateless API for web+mobile; refresh rotation bounds theft.
4. **Optimistic locking via `expected_version`** on expense PATCH; payments guarded by re-checking debtor balance inside a serializable transaction with `Idempotency-Key` table. Rationale: matches spec §6/§7 without distributed locks.
5. **Settlement stored per version** (`SettlementPlan` row with JSON transfers/steps, inputs hash) rather than computed on read. Rationale: history + audit + stable explanations; cost is one row per mutation.
6. **Images to local volume in Docker MVP** (`/data/uploads`, signed-URL equivalent via short-lived tokens), abstracted behind `IFileStore` for S3 later. Rationale: zero new infra now, clean swap later.
7. **Email via `IEmailSender` stub-logging in dev**, SMTP in prod. Rationale: invites/resets testable without a provider.

## Risks / Trade-offs

- Greedy optimizer is heuristic-optimal for n>6; tests assert optimality only for n<=6 and the `<=n-1` bound otherwise. Documented in API + Why-box footnote.
- Single-writer SQLite-style contention does not apply (Postgres), but concurrent payments need the balance re-check; load-test the race with parallel posts.
- `EnsureCreated` databases pre-migration need a baseline migration with existing-tables guard; dev DBs can be reset.
