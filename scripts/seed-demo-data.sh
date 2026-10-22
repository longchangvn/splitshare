#!/usr/bin/env bash
# =============================================================================
# seed-demo-data.sh — create demo users, a group, and random sample expenses
# through the SplitShare HTTP API (no direct DB access needed).
#
# Usage:
#   1. Edit the CONFIG section below (users / passwords / group name).
#   2. Make sure the API is running, e.g.:
#        dotnet run --project api --urls http://localhost:8081
#      (pointed at whichever DB you want: local Postgres or remote SQL Server)
#   3. ./scripts/seed-demo-data.sh
#
# The script is safe to rerun:
#   - existing users are logged into instead of re-registered
#   - an existing group with the same name is reused
#   - expenses whose title already exists in the group are skipped
#
# NOTE: /auth endpoints are rate-limited to 5 calls/min/IP; the script backs
# off automatically when it sees HTTP 429.
# =============================================================================

set -uo pipefail

# ------------------------------- CONFIG --------------------------------------
API="${API:-http://localhost:8081/api/v1}"
GROUP_NAME="${GROUP_NAME:-Road Trip Las Vegas}"
CURRENCY="${CURRENCY:-USD}"

# username|email|display name|password   (add/remove/rename lines freely)
USERS=(
  "user1|user1@example.com|User One|user@1234"
  "user2|user2@example.com|User Two|user2@1234"
  "user3|user3@example.com|User Three|user3@1234"
  "user4|user4@example.com|User Four|user4@1234"
  "user5|user5@example.com|User Five|user5@1234"
)
# -----------------------------------------------------------------------------


jqc() { jq -c "$@"; }
cents_to_dollars() { printf '%d.%02d' $(($1 / 100)) $(($1 % 100)); }

# random integer cents between min and max (inclusive-ish)
rand_cents() { echo $(( (RANDOM % ($2 - $1)) + $1 )); }

# --- HTTP with 429 backoff ---------------------------------------------------
# usage: call METHOD PATH [TOKEN] [JSON_BODY]
call() {
  local method=$1 path=$2 token=${3:-} body=${4:-} tries=7 resp code
  local args=(-s -m 60 -X "$method" "$API$path" -H 'Content-Type: application/json')
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  [ -n "$body" ] && args+=(--data "$body")
  for try in $(seq 1 $tries); do
    resp=$(curl "${args[@]}" -w '\n%{http_code}')
    code=${resp##*$'\n'}
    resp=${resp%$'\n'*}
    # 429 = fixed 1-min window exhausted; 4 tries x 16s guarantees we cross it
    if [ "$code" = 429 ] && [ "$try" -lt "$tries" ]; then
      echo "  rate-limited, waiting 16s..." >&2; sleep 16; continue
    fi
    echo "$resp"; return 0
  done
  echo "$resp"
}

# =============================================================================
# 1. Users — log in (token cache) or register
#
# Tokens are cached in $TOKEN_CACHE keyed by username+password: if you change
# either in CONFIG, that user is re-authenticated automatically. This keeps
# reruns from burning the /auth rate limit (5/min/IP).
# =============================================================================
TOKEN_CACHE="${TOKEN_CACHE:-/tmp/splitshare-seed-tokens.tsv}"

# cache_lookup username password -> "uid\ttok" if the cached token still works
cache_lookup() {
  local line cuser cpass cuid ctok
  line=$(awk -F'\t' -v u="$1" -v p="$2" '$1==u && $2==p {print $3"\t"$4}' "$TOKEN_CACHE" 2>/dev/null | head -1)
  [ -z "$line" ] && return 1
  IFS=$'\t' read -r cuid ctok <<<"$line"
  [ "$(call GET /me "$ctok" | jq -r '.user_id // empty')" = "$cuid" ] || return 1
  printf '%s\t%s' "$cuid" "$ctok"
}

echo "== Users =="
declare -a UID_ARR TOK_ARR
N=${#USERS[@]}
for i in $(seq 0 $((N - 1))); do
  IFS='|' read -r uname email disp pw <<<"${USERS[$i]}"
  if cached=$(cache_lookup "$uname" "$pw"); then
    UID_ARR[$i]=${cached%%$'\t'*}; TOK_ARR[$i]=${cached#*$'\t'}
    echo "  $uname -> ${UID_ARR[$i]} (cached)"
    continue
  fi
  resp=$(call POST /auth/register "" "$(jqc -n \
    --arg u "$uname" --arg e "$email" --arg d "$disp" --arg p "$pw" \
    '{username:$u, email:$e, display_name:$d, password:$p, phone:null}')")
  tok=$(echo "$resp" | jq -r '.access_token // empty')
  if [ -z "$tok" ]; then
    resp=$(call POST /auth/login "" "$(jqc -n \
      --arg u "$uname" --arg p "$pw" '{username_or_email:$u, password:$p}')")
    tok=$(echo "$resp" | jq -r '.access_token // empty')
  fi
  if [ -z "$tok" ]; then echo "FAILED ($uname): $resp"; exit 1; fi
  uid=$(echo "$resp" | jq -r '.user.user_id')
  UID_ARR[$i]=$uid; TOK_ARR[$i]=$tok
  echo "  $uname -> $uid"
done

# persist the cache for the next run
: >"$TOKEN_CACHE"
for i in $(seq 0 $((N - 1))); do
  IFS='|' read -r uname _ <<<"${USERS[$i]}"
  printf '%s\t%s\t%s\t%s\n' "$uname" "${USERS[$i]##*|}" "${UID_ARR[$i]}" "${TOK_ARR[$i]}" >>"$TOKEN_CACHE"
done
OWNER_TOK=${TOK_ARR[0]}

# =============================================================================
# 2. Group — reuse if it already exists, otherwise create
# =============================================================================
echo "== Group =="
GID=$(call GET /groups "$OWNER_TOK" | jq -r --arg n "$GROUP_NAME" \
  '.[] | select(.name == $n) | .group_id' | head -1)
if [ -z "$GID" ]; then
  members=$(printf '%s\n' "${UID_ARR[@]:1}" | jq -R . | jq -s .)
  call POST /groups "$OWNER_TOK" "$(jqc -n \
    --arg n "$GROUP_NAME" --arg c "$CURRENCY" --argjson m "$members" \
    '{name:$n, currency:$c, member_ids:$m, invite_emails:null}')" >/dev/null
  # POST /groups returns an empty body — re-list to find the new id
  GID=$(call GET /groups "$OWNER_TOK" | jq -r --arg n "$GROUP_NAME" \
    '.[] | select(.name == $n) | .group_id' | head -1)
fi
[ -z "$GID" ] && { echo "group creation failed"; exit 1; }
echo "  $GROUP_NAME -> $GID"

# expense titles already in the group (skip them on rerun)
EXISTING=$(call GET "/groups/$GID/ledger?type=expense&limit=100" "$OWNER_TOK" \
  | jq -r '.items[].title' 2>/dev/null)

# =============================================================================
# 3. Expenses — random amounts, all four split types
# =============================================================================
echo "== Expenses =="

add_expense() { # $1=payer-index $2=split-type $3=json-body $4=title
  if echo "$EXISTING" | grep -Fxq "$4"; then
    echo "  skip (exists): $4"; return
  fi
  local resp id
  resp=$(call POST "/groups/$GID/expenses" "${TOK_ARR[$1]}" "$3")
  id=$(echo "$resp" | jq -r '.expense.expense_id // .id // .expense_id // empty')
  if [ -n "$id" ]; then echo "  ok: $4 ($2)"
  else echo "  FAILED: $4 -> $resp"; FAILED=1; fi
}

# --- helpers for randomized splits -------------------------------------------
PARTS_ALL=$(printf '%s\n' "${UID_ARR[@]}" | jq -R . | jq -s .)
PARTS_SUB3=$(printf '%s\n' "${UID_ARR[0]}" "${UID_ARR[2]}" "${UID_ARR[4]}" | jq -R . | jq -s .)
PARTS_SUB4=$(printf '%s\n' "${UID_ARR[0]}" "${UID_ARR[1]}" "${UID_ARR[2]}" "${UID_ARR[3]}" | jq -R . | jq -s .)

# exact: random weights -> cents that sum EXACTLY to total
exact_json() { # $1=total cents, $2..=user ids
  local total=$1; shift; local ids=("$@") n=$# w=() sum=0 out=() acc=0 i c
  for ((i = 0; i < n; i++)); do w[i]=$((RANDOM % 5 + 1)); sum=$((sum + w[i])); done
  for ((i = 0; i < n - 1; i++)); do
    c=$(( total * w[i] / sum )); out+=("$c"); acc=$((acc + c))
  done
  out+=($((total - acc)))  # remainder to the last participant
  for ((i = 0; i < n; i++)); do
    jqc -n --arg u "${ids[$i]}" --argjson c "${out[$i]}" '{user_id:$u, amount_cents:$c}'
  done | jq -s .
}

# percent: random weights -> whole percents that sum to exactly 100
percent_json() {
  local n=$# w=() sum=0 out=() acc=0 i c ids=("$@")
  for ((i = 0; i < n; i++)); do w[i]=$((RANDOM % 5 + 1)); sum=$((sum + w[i])); done
  for ((i = 0; i < n - 1; i++)); do
    c=$((100 * w[i] / sum)); out+=("$c"); acc=$((acc + c))
  done
  out+=("$((100 - acc))")
  for ((i = 0; i < n; i++)); do
    jqc -n --arg u "${ids[$i]}" --argjson p "${out[$i]}" '{user_id:$u, percent:$p}'
  done | jq -s .
}

# shares: random 1..4 shares each
shares_json() {
  local ids=("$@") out
  for u in "${ids[@]}"; do
    jqc -n --arg u "$u" --argjson s "$((RANDOM % 4 + 1))" '{user_id:$u, shares:$s}'
  done | jq -s .
}

trip_day() { # random day/time within Oct 10-13 2026
  echo "2026-10-$((RANDOM % 4 + 10))T$(printf '%02d' $((RANDOM % 14 + 8))):00:00Z"
}

ALL5=("${UID_ARR[@]}")

# 1 — equal, everyone, random amount
A=$(rand_cents 1200 49000)
add_expense 0 equal "$(jqc -n --arg t "Gas — highway run" --arg p "${UID_ARR[0]}" \
  --argjson a "$(cents_to_dollars $A)" --argjson parts "$PARTS_ALL" --arg s "$(trip_day)" \
  '{title:$t, description:null, amount:$a, payer_id:$p, split_type:"equal",
    participant_ids:$parts, category:"transport", spent_at:$s}')" \
  "Gas — highway run"

# 2 — exact amounts, everyone
A=$(rand_cents 20000 90000)
add_expense 1 exact "$(jqc -n --arg t "Hotel — 2 nights" --arg p "${UID_ARR[1]}" \
  --argjson a "$(cents_to_dollars $A)" --argjson parts "$PARTS_ALL" \
  --argjson ex "$(exact_json $A "${ALL5[@]}")" --arg s "$(trip_day)" \
  '{title:$t, description:"Split by room occupancy", amount:$a, payer_id:$p,
    split_type:"exact", participant_ids:$parts, exact:$ex, category:"stay", spent_at:$s}')" \
  "Hotel — 2 nights"

# 3 — percentages, everyone
A=$(rand_cents 15000 60000)
add_expense 2 percent "$(jqc -n --arg t "Group dinner" --arg p "${UID_ARR[2]}" \
  --argjson a "$(cents_to_dollars $A)" --argjson parts "$PARTS_ALL" \
  --argjson pc "$(percent_json "${ALL5[@]}")" --arg s "$(trip_day)" \
  '{title:$t, description:null, amount:$a, payer_id:$p, split_type:"percent",
    participant_ids:$parts, percent:$pc, category:"food", spent_at:$s}')" \
  "Group dinner"

# 4 — weighted shares, everyone
A=$(rand_cents 25000 80000)
add_expense 0 shares "$(jqc -n --arg t "Show tickets" --arg p "${UID_ARR[0]}" \
  --argjson a "$(cents_to_dollars $A)" --argjson parts "$PARTS_ALL" \
  --argjson sh "$(shares_json "${ALL5[@]}")" --arg s "$(trip_day)" \
  '{title:$t, description:"Extra tickets went to whoever wanted them", amount:$a,
    payer_id:$p, split_type:"shares", participant_ids:$parts, shares:$sh,
    category:"activity", spent_at:$s}')" \
  "Show tickets"

# 5 — equal with random tax + tip
A=$(rand_cents 8000 30000); TAX=$(rand_cents 500 2500); TIP=$(rand_cents 1000 4000)
add_expense 3 equal "$(jqc -n --arg t "Buffet dinner" --arg p "${UID_ARR[3]}" \
  --argjson a "$(cents_to_dollars $A)" --argjson parts "$PARTS_ALL" \
  --argjson tax "$(cents_to_dollars $TAX)" --argjson tip "$(cents_to_dollars $TIP)" \
  --arg s "$(trip_day)" \
  '{title:$t, description:"All-in total incl. tax and tip", amount:$a, payer_id:$p,
    split_type:"equal", participant_ids:$parts, tax:$tax, tip:$tip, category:"food",
    spent_at:$s}')" \
  "Buffet dinner"

# 6 — equal, subset of 3
A=$(rand_cents 3000 25000)
add_expense 4 equal "$(jqc -n --arg t "Late-night rides" --arg p "${UID_ARR[4]}" \
  --argjson a "$(cents_to_dollars $A)" --argjson parts "$PARTS_SUB3" --arg s "$(trip_day)" \
  '{title:$t, description:null, amount:$a, payer_id:$p, split_type:"equal",
    participant_ids:$parts, category:"transport", spent_at:$s}')" \
  "Late-night rides"

# 7 — exact, subset of 4
A=$(rand_cents 10000 40000)
add_expense 1 exact "$(jqc -n --arg t "Pool cabana" --arg p "${UID_ARR[1]}" \
  --argjson a "$(cents_to_dollars $A)" --argjson parts "$PARTS_SUB4" \
  --argjson ex "$(exact_json $A "${UID_ARR[0]}" "${UID_ARR[1]}" "${UID_ARR[2]}" "${UID_ARR[3]}")" \
  --arg s "$(trip_day)" \
  '{title:$t, description:null, amount:$a, payer_id:$p, split_type:"exact",
    participant_ids:$parts, exact:$ex, category:"activity", spent_at:$s}')" \
  "Pool cabana"

# 8 — percent with random fee, subset of 3
A=$(rand_cents 6000 20000); FEE=$(rand_cents 200 1500)
add_expense 2 percent "$(jqc -n --arg t "Breakfast" --arg p "${UID_ARR[2]}" \
  --argjson a "$(cents_to_dollars $A)" --argjson parts "$PARTS_SUB3" \
  --argjson pc "$(percent_json "${UID_ARR[0]}" "${UID_ARR[2]}" "${UID_ARR[4]}")" \
  --argjson fee "$(cents_to_dollars $FEE)" --arg s "$(trip_day)" \
  '{title:$t, description:null, amount:$a, payer_id:$p, split_type:"percent",
    participant_ids:$parts, percent:$pc, fee:$fee, category:"food", spent_at:$s}')" \
  "Breakfast"

# 9 — shares, subset of 4
A=$(rand_cents 40000 120000)
add_expense 0 shares "$(jqc -n --arg t "Helicopter tour" --arg p "${UID_ARR[0]}" \
  --argjson a "$(cents_to_dollars $A)" --argjson parts "$PARTS_SUB4" \
  --argjson sh "$(shares_json "${UID_ARR[0]}" "${UID_ARR[1]}" "${UID_ARR[2]}" "${UID_ARR[3]}")" \
  --arg s "$(trip_day)" \
  '{title:$t, description:"Sunrise flight over the canyon", amount:$a, payer_id:$p,
    split_type:"shares", participant_ids:$parts, shares:$sh, category:"activity",
    spent_at:$s}')" \
  "Helicopter tour"

# 10 — equal, everyone
A=$(rand_cents 2000 15000)
add_expense 4 equal "$(jqc -n --arg t "Souvenirs & snacks" --arg p "${UID_ARR[4]}" \
  --argjson a "$(cents_to_dollars $A)" --argjson parts "$PARTS_ALL" --arg s "$(trip_day)" \
  '{title:$t, description:null, amount:$a, payer_id:$p, split_type:"equal",
    participant_ids:$parts, category:"shopping", spent_at:$s}')" \
  "Souvenirs & snacks"

# =============================================================================
# 4. Summary
# =============================================================================
echo
echo "== Ledger =="
call GET "/groups/$GID/ledger?limit=50" "$OWNER_TOK" | jq -r \
  '.items[] | "  \(.kind)\t\(.title)\t$(\(.amount_cents / 100))\tpaid by \(.payer_name // "?")"' \
  2>/dev/null || true
echo "== Balances =="
call GET "/groups/$GID/me" "$OWNER_TOK" | jq -r \
  '"  net: $(\(.net_cents / 100))"' 2>/dev/null || true

exit ${FAILED:-0}
