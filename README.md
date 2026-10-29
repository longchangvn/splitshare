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

## Deploy (Azure, GitHub Actions)

Manual `workflow_dispatch` workflows: **CD API** (`cd-api.yml`) then **CD Web**
(`cd-web.yml`). Both log in to Azure with OIDC. `cd-api.yml` binds a GitHub
environment (`environment:`) to read environment- and repository-level
vars/secrets, so each environment needs a matching federated identity
credential on the Azure app registration. Set it up once per environment:

```sh
az login
scripts/setup-github-oidc.sh <SPLITSHARE_AZURE_CLIENT_ID> splitshare-test
```

See `docs/github-oidc-setup.md` for details and the portal alternative.

## Test

```sh
dotnet test tests/SplitShare.Tests.csproj
npm run --prefix web build
node --test web/test/*.mjs
```

## Web: quick "Add expense"

The dashboard views (`/`, `/groups`, `/activity`) show a floating **Add expense**
button. Its picker selects people (multi-select + scrollable contacts list) and/or
one group, then **Next**:

- group only → opens the group with the New expense form;
- people only → creates a group with a default name ("You, Ann, Bob", USD) and those
  people, then opens the New expense form;
- people + group → opens the New group wizard pre-filled with the people and the
  group's members; **Next** creates it and opens the New expense form.

Spec: `specs/003-quick-add-expense/`. Frontend-only; uses existing endpoints.

## Web (mobile site): scan receipt in Add expense

On phone-width screens (`max-width: 47.99em`) the New expense form shows **Scan receipt**
when `GET /api/v1/capabilities` returns `ocr_enabled: true`. The phone offers camera or
photo library; the image is resized (≤1600 px), re-encoded as JPEG quality 70 % with
70 DPI, sent to `POST /api/v1/groups/{id}/expenses/scan` → `{ total, confidence, warnings }`,
and only the **Amount** field is filled with the receipt total. The photo is attached as a
receipt on Save.

The API forwards the image (EXIF stripped) to an OpenAI-compatible vision endpoint —
OpenCode Console by default. Config (`Ocr` section; the key is secret, env/user-secrets only):

```sh
dotnet user-secrets set "Ocr:Enabled" "true" --project api
dotnet user-secrets set "Ocr:ApiKey" "<key>" --project api
dotnet user-secrets set "Ocr:Model" "<vision model>" --project api
# optional: Ocr:BaseUrl (default OpenCode), Ocr:TimeoutSeconds,
# Ocr:RateLimit:PermitLimit / WindowMinutes (default 20 scans / 10 min per user)
```

OpenCode **free** models reject API calls (`403 FreeTierError`, verified 2026-10-22) — use a
paid OpenCode model, or another OpenAI-compatible provider via `Ocr:BaseUrl` (e.g. Gemini:
`https://generativelanguage.googleapis.com/v1beta/openai`).

Live check against the real provider (opt-in, uses credits; sample receipt total is 21.00):

```sh
set -a; . ./.env; set +a; OCR_LIVE_TEST=1 dotnet test tests --filter ReceiptScanLiveTests
```

Compose: `OCR_ENABLED`, `OCR_API_KEY`, `OCR_MODEL`. CD: vars `OCR__ENABLED`, `OCR__MODEL`,
secret `OCR__APIKEY`. Spec: `specs/004-multi-receipt-expenses/`.

## Mobile (Expo) — web parity

`mobile/` is an Expo (React Native) client that mirrors the web app feature for
feature: same endpoints, same payloads, same money rules, same permission model.
Run the API on `:8081` and Expo on `:8082`:

```sh
dotnet run --project api --urls http://localhost:8081
cd mobile && npm install && npm start     # i = iOS simulator, a = Android
npm test                                  # mapping check + unit tests
```

Screens, endpoints and the three accepted gaps (export stays web-only, light
palette only, group navigation via tabs + one `⋯` sheet) are documented in
[mobile/README.md](mobile/README.md). Plan and parity matrix:
`specs/005-mobile-parity/`. Two API additions back the mobile client —
`GET /me/activity` (global feed) and `POST/PATCH/DELETE /me/devices` (Expo push
tokens + per-group mute); both degrade gracefully on older app builds.

## API contract

- Base `/api/v1`, **snake_case both directions**, errors `{code, message, fields?}`.
- Auth: JWT access (15 min) + rotating opaque refresh (30 d). Google via ID token.
- Docs: `/openapi.json` (Development).
- Money POSTs accept `Idempotency-Key` for safe retries.
