#!/usr/bin/env bash
# The Today demo, on the v1 schema: ten clients and a day built around the
# moment you run it — what is over is done and logged, the session on now is
# running, and every row the attention queue can raise has a client behind it.
# Development only — never run this against production.
#
# Unlike the three older seeds (seed-sample-month, seed-full-demo,
# seed-realistic-20), which still write the pre-v1 schema, this one targets the
# 25 Sep 2026 baseline. It owns what it creates — clients tagged
# `metadata->>'seed' = 'today'` — and a re-run retires those and their tail
# before rebuilding, so run it again tomorrow for a fresh day. It also replaces
# the trainer's working hours.
#
# Usage:
#   ./scripts/seed-demo-today.sh +919841022119          # against the docker db
#   PSQL="psql $DATABASE_URL" ./scripts/seed-demo-today.sh +919841022119
#
# The trainer must already exist and have a workspace: sign in once first.

set -euo pipefail

PHONE="${1:-}"
if [[ -z "$PHONE" ]]; then
  echo "usage: $0 <trainer-phone, +91…>" >&2
  exit 64
fi
# app_user.phone is E.164; accept the ten digits a person types.
[[ "$PHONE" =~ ^[6-9][0-9]{9}$ ]] && PHONE="+91$PHONE"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL="$HERE/seed-demo-today.sql"

CONTAINER="${POSTGRES_CONTAINER:-inclineyou-postgres}"
# The OWNER, not the app role: row-level security would filter an
# `inclineyou_app` connection down to whichever workspace it was labelled with,
# which for a script is none.
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
