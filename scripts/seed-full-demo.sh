#!/usr/bin/env bash
#
# Loads the full demo dataset for a trainer: 44 clients and every feature the
# app has, in a state worth looking at. Development only — never run this
# against production.
#
# This is the big one. `seed-sample-month.sh` is the small one — six clients and
# a month, enough for every screen to render while you work on it. Use this
# instead when you want a roster long enough for the A–Z rail to exist, every
# client state the roster can draw, and rows in every table the sync pulls:
# workout logs with swaps and unplanned work, weekly reports, nudge rules and
# their message history, custom exercises, batches, a gym price list, a discount
# and a written-off debt.
#
# It owns exactly what it creates: every client it inserts is tagged
# `metadata->>'seed' = 'demo'`, and re-running tombstones those and their whole
# tail before rebuilding. Clients you added by hand are left alone.
#
# It also retires the small seed's clients (`seed = 'true'`). The two are
# alternatives rather than layers — they both write the trainer's working hours,
# price list and templates, and running one on top of the other leaves a diary
# with two of every shift on it.
#
# Usage:
#   ./scripts/seed-full-demo.sh 9841657298          # against the docker db
#   PSQL="psql $DATABASE_URL" ./scripts/seed-full-demo.sh 9841657298
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
SQL="$HERE/seed-full-demo.sql"

# By default, talk to the compose database the getting-started guide sets up.
# Override PSQL to point anywhere else.
CONTAINER="${POSTGRES_CONTAINER:-xrep-postgres}"
DB_USER="${POSTGRES_USER:-xrep}"
DB_NAME="${POSTGRES_DB:-xrepdb}"

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
