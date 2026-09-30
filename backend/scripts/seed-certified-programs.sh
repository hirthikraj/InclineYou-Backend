#!/usr/bin/env bash
#
# Loads four InclineYou library programs (origin = 'inclineyou') so /programs/certified,
# "Use this" and the stale flag have something to show. Development only.
#
# They are marked is_sample = true (reviewed_at NULL): this is placeholder content built
# from the exercise library, not programming a coach has signed off, and the product must
# never present it as reviewed. Safe to re-run — a program that already exists by name is
# left alone. Unlike the trainer seeds it takes no phone: the library belongs to nobody.
#
# Usage:
#   ./scripts/seed-certified-programs.sh
#   PSQL="psql $DATABASE_URL" ./scripts/seed-certified-programs.sh

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL="$HERE/seed-certified-programs.sql"

CONTAINER="${POSTGRES_CONTAINER:-inclineyou-postgres}"
# The OWNER: library rows have no tenant, and the app role's policies only let it read them.
DB_USER="${POSTGRES_USER:-${MIGRATION_DB_USERNAME:-inclineyou}}"
DB_NAME="${POSTGRES_DB:-inclineyoudb}"

if [[ -n "${PSQL:-}" ]]; then
  # shellcheck disable=SC2086
  $PSQL -f "$SQL"
elif docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" < "$SQL"
else
  echo "No PSQL set and container '$CONTAINER' is not running." >&2
  echo "Start it with:  docker compose up -d postgres" >&2
  exit 69
fi
