#!/usr/bin/env bash
#
# Rebuilds one trainer's workspace as three months of working life on the v1 schema:
# 16 clients, a diary with logged sets, a money book that obeys the ledger triggers,
# a gym arrangement, assessments, nudges. See the header of seed-three-months.sql.
#
# DESTRUCTIVE for the trainer you name: their clients, diary, money, programs and
# price list are deleted first. The sign-in itself is kept. Development only.
#
# Usage:
#   ./scripts/seed-three-months.sh 9840137911          # against the docker db
#   ./scripts/seed-three-months.sh +919840137911
#   PSQL="psql $DATABASE_URL" ./scripts/seed-three-months.sh 9840137911
#
# The trainer must already exist — sign in once, which creates the row from the phone.

set -euo pipefail

PHONE="${1:-}"
if [[ -z "$PHONE" ]]; then
  echo "usage: $0 <trainer-phone>" >&2
  exit 64
fi
# app_user.phone is E.164; accept the ten digits a person types, or a spaced +91 number.
PHONE="${PHONE//[[:space:]]/}"
[[ "$PHONE" =~ ^[6-9][0-9]{9}$ ]] && PHONE="+91$PHONE"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL="$HERE/seed-three-months.sql"

CONTAINER="${POSTGRES_CONTAINER:-inclineyou-postgres}"
# The OWNER, not the app role: row-level security would filter an `inclineyou_app`
# connection down to whichever workspace it was labelled with, which for a script is none.
DB_USER="${POSTGRES_USER:-${MIGRATION_DB_USERNAME:-inclineyou}}"
DB_NAME="${POSTGRES_DB:-inclineyoudb}"

if [[ -n "${PSQL:-}" ]]; then
  # shellcheck disable=SC2086
  $PSQL -q -v trainer_phone="$PHONE" -f "$SQL"
elif docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  docker exec -i "$CONTAINER" psql -q -U "$DB_USER" -d "$DB_NAME" \
    -v trainer_phone="$PHONE" < "$SQL"
else
  echo "No PSQL set and container '$CONTAINER' is not running." >&2
  echo "Start it with:  docker compose up -d postgres" >&2
  exit 69
fi
