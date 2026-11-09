#!/usr/bin/env bash
# =============================================================================
# scripts/e2e.sh — manual trigger for the end-to-end suites.
#
#   ./scripts/e2e.sh          # API E2E + browser (Playwright) E2E
#   ./scripts/e2e.sh --api    # API-level only (tests.e2e, in-process host)
#   ./scripts/e2e.sh --web    # browser only (starts the API + Vite itself)
#
# Requirements: local Postgres (compose `db` on localhost:5432), .NET 10 SDK, Node.
# Environment: .env.e2e — test database `splitshare_e2e` (dropped + recreated by
# the API suite), external side effects off. Nothing here touches the `splitshare`
# dev database or Azure SQL.
#
# Note: the browser suite starts its own API (port 8093) and Vite (port 3013),
# so a normal dev server on 8081/3000 can keep running. Playwright fails with a
# clear message if those E2E ports are already in use.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

RUN_API=1
RUN_WEB=1
case "${1:-}" in
  --api) RUN_WEB=0 ;;
  --web) RUN_API=0 ;;
  "") ;;
  *) echo "usage: $0 [--api|--web]" >&2; exit 2 ;;
esac

# One environment for both suites (test DB, no secrets, side effects off).
set -a
# shellcheck disable=SC1091
source .env.e2e
set +a

status=0

if [ "$RUN_API" = 1 ]; then
  echo "==> API E2E (tests.e2e → database ${E2E_DB:-splitshare_e2e})"
  dotnet test tests.e2e/SplitShare.E2E.csproj || status=$?
fi

if [ "$RUN_WEB" = 1 ]; then
  echo "==> Browser E2E (Playwright → web/e2e)"
  [ -d web/node_modules ] || npm --prefix web install
  (cd web && npx playwright install chromium) # no-op when already installed
  npm --prefix web run test:e2e || status=$?
fi

if [ "$status" -ne 0 ]; then
  echo "E2E FAILED (exit $status)" >&2
else
  echo "E2E OK"
fi
exit "$status"
