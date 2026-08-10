#!/usr/bin/env bash
#
# Loads one month of sample data for a trainer, so every screen has something
# honest to render while you work on it. Development only — never run this
# against production.
#
# It owns exactly what it creates: every client it inserts is tagged
# `metadata->>'seed' = 'true'`, and re-running deletes those and their whole
# tail before rebuilding. Clients you added by hand are left alone, so it is
# safe to run repeatedly against a database you are already using.
#
# Usage:
#   ./scripts/seed-sample-month.sh 9841657298          # against the docker db
#   PSQL="psql $DATABASE_URL" ./scripts/seed-sample-month.sh 9841657298
#
# The trainer must already exist — sign in on the app once, which creates the
# row from the phone number you used.

set -euo pipefail

PHONE="${1:-}"
if [[ -z "$PHONE" ]]; then
  echo "usage: $0 <trainer-phone>" >&2
  exit 64
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL="$HERE/seed-sample-month.sql"

# By default, talk to the compose database the getting-started guide sets up.
# Override PSQL to point anywhere else.
CONTAINER="${POSTGRES_CONTAINER:-trainx-postgres}"
DB_USER="${POSTGRES_USER:-trainx}"
DB_NAME="${POSTGRES_DB:-trainxdb}"

if [[ -n "${PSQL:-}" ]]; then
  # shellcheck disable=SC2086
  $PSQL -v trainer_phone="$PHONE" -f "$SQL"
elif docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" \
    -v trainer_phone="$PHONE" < "$SQL"
else
  echo "No PSQL set and container '$CONTAINER' is not running." >&2
  echo "Start it with:  docker compose up -d postgres" >&2
  exit 69
fi
