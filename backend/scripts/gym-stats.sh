#!/usr/bin/env bash
#
# Prints gym_place_stats: how many trainers and active clients sit behind each gym
# in the directory. Counts only — no person is named. Sales / support use, as the
# OWNER role (the request role cannot read the view, by design).
#
# Usage:  ./scripts/gym-stats.sh            # compose database
#         PSQL="psql $URL" ./scripts/gym-stats.sh

set -euo pipefail

CONTAINER="${POSTGRES_CONTAINER:-inclineyou-postgres}"
DB_USER="${POSTGRES_USER:-${MIGRATION_DB_USERNAME:-inclineyou}}"
DB_NAME="${POSTGRES_DB:-inclineyoudb}"
QUERY="SELECT name, city, trainers, active_clients FROM gym_place_stats ORDER BY trainers DESC, active_clients DESC, name;"

if [[ -n "${PSQL:-}" ]]; then
  # shellcheck disable=SC2086
  $PSQL -c "$QUERY"
elif docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "$QUERY"
else
  echo "No PSQL set and container '$CONTAINER' is not running." >&2
  exit 69
fi
