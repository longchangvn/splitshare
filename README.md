# SplitShare V1

Expense splitting for groups: receipt expenses, auto-split, minimum-transfer
settlement with explanations, pay/settle-up with group locking.

Full spec: `requirements-splitshare.md`. Archived change: `openspec/changes/archive/2026-10-13-splitshare-v1/`, main specs: `openspec/specs/splitshare-v1/`.

## Stack

- `api/` — .NET 10 minimal API + EF Core + Postgres (`splitshare` schema)
- `web/` — React 18 + Vite + react-router-dom
- `apphost/` + `servicedefaults/` — .NET Aspire orchestration (local dev only)
- `SplitShare.sln` — all .NET projects
- Postgres `module_platform` DB (shared host DB; our tables live in schema `splitshare`)

## Run (Docker)

```sh
cp .env.example .env
# set a strong JWT_KEY inside .env, then:
docker compose up --build
# web http://localhost:3000 · api http://localhost:5000/health · db localhost:5433
```

`Jwt__Key` (≥32 chars) is required in production; dev falls back to an
insecure key with a console warning. `VITE_GOOGLE_CLIENT_ID` enables the
Google button; `App:BaseUrl` shapes invite links (default `http://localhost:3000`).

## Run (Aspire, local dev orchestration)

```sh
ASPIRE_ALLOW_UNSECURED_TRANSPORT=true \
ASPNETCORE_URLS=http://localhost:18888 \
ASPIRE_DASHBOARD_OTLP_ENDPOINT_URL=http://localhost:4317 \
ASPIRE_DASHBOARD_OTLP_HTTP_ENDPOINT_URL=http://localhost:4318 \
dotnet run --project apphost/SplitShare.AppHost.csproj
# dashboard http://localhost:18888 (token printed in log) · api :5079 · web :5173
```

The AppHost starts the API (`dotnet run --project api`) and Vite dev server,
injects `ConnectionStrings__module-platform` (default: your localhost:5433 DB)
and `VITE_API_URL`, and wires OpenTelemetry into the dashboard.
Notes: API runs as an executable resource (DCP 9.5.2 silently drops
`AddProject` and literal-`AddConnectionString` references in this setup —
see `apphost/Program.cs`); ServiceDefaults add OTel/resilience/discovery and
are no-ops when running the API standalone. Production stays on compose.

## Run (local dev, without Aspire)

```sh
# API (needs Postgres on localhost:5433, user/password module_platform)
dotnet run --project api --urls http://localhost:5099
# Web (proxies /api to VITE_API_URL or localhost:5000)
VITE_API_URL=http://localhost:5099 npm run --prefix web dev
```

## Test

```sh
dotnet test tests/SplitShare.Tests.csproj
npm run --prefix web build
```

## API contract

- Base `/api/v1`, **snake_case both directions**, errors `{code, message, fields?}`.
- Auth: JWT access (15 min) + rotating opaque refresh (30 d). Google via ID token.
- Docs: `/openapi.json` (Development).
- Money POSTs accept `Idempotency-Key` for safe retries.
