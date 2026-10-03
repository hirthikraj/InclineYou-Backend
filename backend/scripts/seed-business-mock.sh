#!/usr/bin/env bash
#
# Mock money history for an EXISTING trainer — see seed-business-mock.sql for what it builds.
# It layers on the trainer's own clients and never edits one; every row it writes has a
# 9d0c0000-0000-4000-8000-… id, so it is idempotent and `reset` removes exactly its own rows.
#
# Usage:
#   ./scripts/seed-business-mock.sh 9812345678          # add the mock money history
#   ./scripts/seed-business-mock.sh 9812345678 reset    # soft-delete it again
#   PSQL="psql $DATABASE_URL" ./scripts/seed-business-mock.sh 9812345678
#
# Unlike the three trainer seeds this does NOT create clients' plans or sessions — it is the money
# book only, so it can be run over any of them (or over a hand-made account like your own).

set -euo pipefail

PHONE="${1:-}"
if [[ -z "$PHONE" ]]; then
  echo "usage: $0 <trainer-phone> [reset]" >&2
  exit 64
fi
RESET=0
[[ "${2:-}" == "reset" ]] && RESET=1

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL="$HERE/seed-business-mock.sql"
CONTAINER="${POSTGRES_CONTAINER:-inclineyou-postgres}"
# The OWNER role: a seed writes across row-level security, which an `inclineyou_app` connection would not.
DB_USER="${POSTGRES_USER:-${MIGRATION_DB_USERNAME:-inclineyou}}"
DB_NAME="${POSTGRES_DB:-inclineyoudb}"

if [[ -n "${PSQL:-}" ]]; then
  # shellcheck disable=SC2086
  $PSQL -v ON_ERROR_STOP=1 -v trainer_phone="$PHONE" -v reset="$RESET" -f "$SQL"
elif docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 \
    -v trainer_phone="$PHONE" -v reset="$RESET" < "$SQL"
else
  echo "No PSQL set and container '$CONTAINER' is not running." >&2
  echo "Start it with:  docker compose up -d postgres" >&2
  exit 69
fi
