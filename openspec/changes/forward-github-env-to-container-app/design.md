## Context

The `cd-api.yml` workflow currently handles env vars in two places: the update path (lines 268-330, jq-based PUT) and the create path (lines 343-367, `ENV_ARGS` array). Both have hardcoded env var lists. The workflow already fetches existing container env via `az containerapp show` and filters with jq. GitHub Actions exposes vars via `${{ vars.* }}` and secrets via `${{ secrets.* }}`.

## Goals / Non-Goals

**Goals:**
- Replace per-variable hardcoding with a generic loop that forwards all GitHub env vars/secrets to the container app
- Existing container env values always win (never overwrite)
- Work identically on both update and create paths
- Mask all secret values in logs

**Non-Goals:**
- No Azure Key Vault integration
- No changes to `cd-web.yml` in this change
- No removal of the existing hardcoded vars (they become redundant but safe to keep)

## Decisions

**Approach: Bash loop with `az containerapp show` + jq**

1. Before the update/create step, fetch existing env var names from the container app
2. Iterate over a combined list of GitHub vars and secrets (passed as parallel arrays)
3. For each var, check if it already exists in the container's env list
4. If not present, add it to the jq filter (update path) or `ENV_ARGS` (create path)
5. Mask secret values with `::add-mask::`

**Alternative considered: GitHub Actions `env` context JSON**
- Could pass `${{ toJSON(vars) }}` and `${{ toJSON(secrets) }}` as JSON and parse with jq
- Rejected: secrets in plaintext in the workflow definition is a security risk; explicit listing is safer

**Alternative considered: Separate reusable workflow**
- Could extract env-sync into a composite action
- Rejected: over-engineering for a single consumer; can refactor later if `cd-web.yml` needs it

## Risks / Trade-offs

- **Security**: Secrets passed as workflow env are visible in `echo` output — must mask immediately
- **Var name collisions**: GitHub environment names may not match Azure naming conventions (e.g. `Notification__Provider` vs `NOTIFICATION_PROVIDER`) — the sync must use the exact Azure env var name as the GitHub var name
- **Idempotency**: The "only if not existing" check makes the workflow safe to re-run
