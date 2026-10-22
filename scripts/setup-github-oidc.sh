#!/usr/bin/env bash
#
# Create GitHub Actions OIDC federated identity credentials so a workflow job
# that declares `environment:` can log in to Azure. GitHub then emits an OIDC
# token whose `sub` is
#   repo:<owner>@<ownerId>/<repo>@<repoId>:environment:<env>
# and Azure must trust that exact subject (otherwise: AADSTS700213).
#
# Works for both possible GitHub-OIDC principals:
#   * an App registration  -> az ad app federated-credential ...
#   * a Managed Identity   -> az identity federated-credential ...
# The principal type is detected automatically.
#
# This is additive: it does not touch existing ref-based credentials, so jobs
# without an environment keep working.
#
# Usage:
#   scripts/setup-github-oidc.sh [<azure-client-id>] <environment> [<environment>...]
#
# If <azure-client-id> is omitted (or is not a GUID) it is auto-detected from
# the subscription's service-principal role assignments.
#
# Examples:
#   scripts/setup-github-oidc.sh splitshare-test
#   scripts/setup-github-oidc.sh 00000000-1111-2222-3333-444444444444 splitshare-test production
#
# Requirements:
#   - az  : logged in (`az login`) with rights to manage the app/identity
#           (Application Owner / Cloud Application Administrator / Managed
#           Identity Contributor).
#   - gh  : optional; used to auto-detect owner/repo numeric ids. If missing,
#           set OWNER, REPO, OWNER_ID and REPO_ID below/in the environment.
#   - jq  : only when OWNER_ID/REPO_ID must be discovered via `gh`.
#
# Overridable environment variables:
#   RG                              resource group for managed identities (default: splitshare)
#   OWNER, REPO, OWNER_ID, REPO_ID  otherwise detected with `gh`/git remote.
#
set -euo pipefail

RG="${RG:-splitshare}"

if [ "$#" -eq 0 ]; then
  echo "usage: $0 [<azure-client-id>] <environment> [<environment>...]" >&2
  exit 1
fi

# First argument is a client id only if it looks like a GUID; otherwise every
# argument is an environment name and the client id is auto-detected.
if [[ "$1" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
  CLIENT_ID="$1"
  shift
else
  CLIENT_ID=""
fi
ENVS=("$@")
if [ "${#ENVS[@]}" -eq 0 ]; then
  echo "error: at least one environment name is required." >&2
  exit 1
fi

ISSUER="https://token.actions.githubusercontent.com"
AUDIENCE="api://AzureADTokenExchange"

# --- Resolve owner/repo and their immutable numeric ids (embedded in subject) ---
REPO_SLUG="${GITHUB_REPOSITORY:-$(git config --get remote.origin.url \
  | sed -E 's#(git@|https://)github.com[:/]##; s#\.git$##')}"
OWNER="${OWNER:-${REPO_SLUG%%/*}}"
REPO="${REPO:-${REPO_SLUG##*/}}"

if [ -z "${OWNER_ID:-}" ] || [ -z "${REPO_ID:-}" ]; then
  if ! command -v gh >/dev/null 2>&1; then
    echo "error: gh not found; set OWNER, REPO, OWNER_ID and REPO_ID env vars." >&2
    exit 1
  fi
  OWNER_ID="${OWNER_ID:-$(gh api "users/$OWNER" --jq .id)}"
  REPO_ID="${REPO_ID:-$(gh api "repos/$OWNER/$REPO" --jq .id)}"
fi

# --- Auto-detect the OIDC principal if no client id was supplied ---
if [ -z "$CLIENT_ID" ]; then
  OBJ_IDS=$(az role assignment list --all \
    --query "[?principalType=='ServicePrincipal'].principalId" -o tsv | sort -u)
  COUNT=$(printf '%s\n' "$OBJ_IDS" | grep -c . || true)
  if [ "$COUNT" -eq 0 ]; then
    echo "error: no service-principal role assignment found; pass <azure-client-id> explicitly." >&2
    exit 1
  elif [ "$COUNT" -gt 1 ]; then
    echo "error: multiple service principals hold roles; pass <azure-client-id> explicitly:" >&2
    for o in $OBJ_IDS; do
      printf '  %s  %s\n' "$o" "$(az ad sp show --id "$o" --query appId -o tsv 2>/dev/null || echo '<unresolvable>')" >&2
    done
    exit 1
  fi
  CLIENT_ID=$(az ad sp show --id "$OBJ_IDS" --query appId -o tsv)
  echo "Auto-detected OIDC principal object: $OBJ_IDS"
fi

# --- Determine whether it is an app registration or a managed identity ---
SP_TYPE=$(az ad sp show --id "$CLIENT_ID" --query servicePrincipalType -o tsv 2>/dev/null || echo "")
  MI_NAME=""
  MI_RG=""
  if [ "$SP_TYPE" = "ManagedIdentity" ]; then
  MI_NAME=$(az identity list --resource-group "$RG" \
    --query "[?clientId=='$CLIENT_ID'].name | [0]" -o tsv 2>/dev/null || true)
  MI_RG="$RG"
  if [ -z "$MI_NAME" ] || [ "$MI_NAME" = "None" ]; then
    MI_NAME=$(az identity list --query "[?clientId=='$CLIENT_ID'].name | [0]" -o tsv 2>/dev/null || true)
    MI_RG=""
    if [ -n "$MI_NAME" ] && [ "$MI_NAME" != "None" ]; then
      MI_RG=$(az identity list --query "[?clientId=='$CLIENT_ID'].resourceGroup | [0]" -o tsv 2>/dev/null || true)
    fi
  fi
  if [ -z "$MI_NAME" ] || [ "$MI_NAME" = "None" ]; then
    echo "error: principal $CLIENT_ID is a managed identity but no matching managed identity found in RG '$RG' or the subscription." >&2
    exit 1
  fi
fi

echo "Azure client id       : $CLIENT_ID"
if [ "$SP_TYPE" = "ManagedIdentity" ]; then
  echo "Principal type        : Managed Identity ($MI_NAME in ${MI_RG:-<unknown rg>})"
else
  echo "Principal type        : App registration (servicePrincipalType='${SP_TYPE:-unknown}')"
fi
echo "Repository            : $OWNER@$OWNER_ID/$REPO@$REPO_ID"
echo "Environments          : ${ENVS[*]}"
echo

MI_RG_ARGS=()
[ -n "$MI_RG" ] && MI_RG_ARGS=(--resource-group "$MI_RG")

for ENV in "${ENVS[@]}"; do
  SUBJECT="repo:$OWNER@$OWNER_ID/$REPO@$REPO_ID:environment:$ENV"
  NAME="github-$ENV"

  echo "=== environment: $ENV ==="
  echo "subject: $SUBJECT"

  if [ "$SP_TYPE" = "ManagedIdentity" ]; then
    EXISTS=$(az identity federated-credential list \
      --identity-name "$MI_NAME" ${MI_RG_ARGS[@]+"${MI_RG_ARGS[@]}"} \
      --query "[?name=='$NAME'] | length(@)" -o tsv 2>/dev/null || echo 0)
    if [ "$EXISTS" = "1" ]; then
      echo "Federated credential '$NAME' already exists — skipping."
      echo
      continue
    fi
    az identity federated-credential create \
      --identity-name "$MI_NAME" ${MI_RG_ARGS[@]+"${MI_RG_ARGS[@]}"} \
      --name "$NAME" \
      --issuer "$ISSUER" \
      --subject "$SUBJECT" \
      --audiences "$AUDIENCE" \
      --output none
  else
    EXISTS=$(az ad app federated-credential list --id "$CLIENT_ID" \
      --query "[?name=='$NAME'] | length(@)" -o tsv 2>/dev/null || echo 0)
    if [ "$EXISTS" = "1" ]; then
      echo "Federated credential '$NAME' already exists — skipping."
      echo
      continue
    fi
    az ad app federated-credential create \
      --id "$CLIENT_ID" \
      --parameters "{
        \"name\": \"$NAME\",
        \"issuer\": \"$ISSUER\",
        \"subject\": \"$SUBJECT\",
        \"audiences\": [\"$AUDIENCE\"],
        \"description\": \"GitHub Actions OIDC for environment $ENV\"
      }" \
      --output none
  fi

  echo "Created federated credential '$NAME'."
  echo
done

echo "Done. Re-run the deploy workflow; the OIDC login should now succeed."
