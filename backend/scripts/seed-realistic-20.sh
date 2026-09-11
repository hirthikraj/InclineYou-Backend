#!/usr/bin/env bash
#
# Loads a realistic working week for a trainer: 20 clients, never two of them
# booked at the same time, and two months of logged workouts behind them.
# Development only — never run this against production.
#
# The third of three seeds, and they are alternatives rather than layers:
#
#   seed-sample-month.sh   6 clients, one month. The smallest honest dataset —
#                          enough for every screen to render while you work on it.
#   seed-full-demo.sh      44 clients and every state the roster can draw. The
#                          right thing for a design review, and the wrong thing
#                          for anything that has to look like a real book: at 44
#                          clients five people share the 6am slot.
#   seed-realistic-20.sh   this one. One trainer's plausible week — a timetable
#                          with one person on the floor at a time, nine weeks of
#                          history and two weeks of bookings ahead.
#
# It owns exactly what it creates: every client it inserts is tagged
# `metadata->>'seed' = 'real20'`, and re-running tombstones those and their whole
# tail before rebuilding. Clients you added by hand are left alone.
#
# It also retires the other two seeds' clients ('demo' and 'true'). All three
# write the trainer's working hours, price list and templates, so running one on
# top of another leaves a diary with two of every shift on it.
#
# Two invariants are checked inside the transaction, so a run that would produce
# a diary the product could not have produced aborts instead of committing:
#
#   · every client's chosen weekdays cover their template's ordinal days exactly
#     once, which is the rule `POST /v1/templates/{id}/apply` enforces; and
#   · no two of the trainer's sessions overlap. Not "share a start time" —
#     overlap, measured against each session's own duration.
#
# It prints the week's timetable when it is done, so the second one is visible
# rather than merely asserted.
#
# Usage:
#   ./scripts/seed-realistic-20.sh 9841657298          # against the docker db
#   PSQL="psql $DATABASE_URL" ./scripts/seed-realistic-20.sh 9841657298
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
SQL="$HERE/seed-realistic-20.sql"

# By default, talk to the compose database the getting-started guide sets up.
# Override PSQL to point anywhere else.
CONTAINER="${POSTGRES_CONTAINER:-xrep-postgres}"
# The OWNER, not the app role. A seed inserts across every workspace it builds,
# and row-level security would filter an `xrep_app` connection down to whichever
# workspace the connection was labelled with — which, for a script, is none.
DB_USER="${POSTGRES_USER:-${MIGRATION_DB_USERNAME:-xrep}}"
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
