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
# web http://localhost:3000 · api http://localhost:8081/health · db localhost:5433
```

`Jwt__Key` (≥32 chars) is required in production; dev falls back to an
insecure key with a console warning. `VITE_GOOGLE_CLIENT_ID` enables the
Google button; `App:BaseUrl` shapes invite links (default `http://localhost:3000`).

## Run (Aspire, local dev orchestration)

```sh
ASPIRE_ALLOW_UNSECURED_TRANSPORT=true \
ASPNETCORE_URLS=http://localhost:8080 \
ASPIRE_DASHBOARD_OTLP_ENDPOINT_URL=http://localhost:4317 \
ASPIRE_DASHBOARD_OTLP_HTTP_ENDPOINT_URL=http://localhost:4318 \
dotnet run --project apphost/SplitShare.AppHost.csproj
# dashboard http://localhost:8080 (token printed in log) · api :8081 · web :3000
```

The AppHost starts the API (`dotnet run --project api`) and Vite dev server,
injects `Database__Provider=postgres` + `Database__Postgres` (default: your
localhost:5433 DB — override via `ConnectionStrings__module-platform` in the
AppHost environment) and `VITE_API_URL`, and wires OpenTelemetry into the
dashboard.
Notes: API runs as an executable resource (DCP 9.5.2 silently drops
`AddProject` and literal-`AddConnectionString` references in this setup —
see `apphost/Program.cs`); ServiceDefaults add OTel/resilience/discovery and
are no-ops when running the API standalone. Production stays on compose.

## Run (local dev, without Aspire)

```sh
# Connection strings are env/secrets-only — never appsettings*.json.
# Local runs: set them once per machine with user-secrets (auto-loaded in
# Development); default provider is sqlServer, so:
dotnet user-secrets set "Database:SqlServer" "<connection-string>" --project api
# Local Postgres instead:
# dotnet user-secrets set "Database:Provider" "postgres" --project api
# dotnet user-secrets set "Database:Postgres" "Host=localhost;Port=5432;Database=splitshare;Username=module_platform;Password=module_platform" --project api
# API
dotnet run --project api --urls http://localhost:8081
# Web (proxies /api to VITE_API_URL or localhost:8081)
VITE_API_URL=http://localhost:8081 npm run --prefix web dev
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
