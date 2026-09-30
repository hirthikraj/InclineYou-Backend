#!/usr/bin/env bash
#
# Puts real content into a trainer's programs. Development only.
#
# The trainer seeds create client plans whose workouts are empty shells (Full Body A/B/C each
# week, no exercises), and leave the trainer's own shelf empty. This fills all three places
# the Programs screens read:
#
#   · every client plan's workouts that have no exercises yet — sets, rest, load, alternatives,
#     and a week-by-week progression (more sets, a heavier load) so weeks do not all look alike;
#   · six of the trainer's own templates (the Templates shelf), each with its workouts;
#   · four standalone workouts (the Workouts shelf), with labelled dividers.
#
# Safe to re-run: a workout that already has exercises is left alone, and a template or
# standalone workout is skipped when one of that name is already live. It needs the trainer's
# existing client plans (run a trainer seed first) — the workspace is read from them.
#
# Usage:
#   ./scripts/seed-program-data.sh +919812345678
#   PSQL="psql $DATABASE_URL" ./scripts/seed-program-data.sh +919812345678

set -euo pipefail

PHONE="${1:-}"
if [[ -z "$PHONE" ]]; then
  echo "usage: $0 <trainer-phone>" >&2
  exit 64
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL="$HERE/seed-program-data.sql"

CONTAINER="${POSTGRES_CONTAINER:-inclineyou-postgres}"
# The OWNER: a seed writes across a workspace, and row-level security would filter the app role to nothing.
DB_USER="${POSTGRES_USER:-${MIGRATION_DB_USERNAME:-inclineyou}}"
DB_NAME="${POSTGRES_DB:-inclineyoudb}"

if [[ -n "${PSQL:-}" ]]; then
  # shellcheck disable=SC2086
  $PSQL -v trainer_phone="$PHONE" -f "$SQL"
elif docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v trainer_phone="$PHONE" < "$SQL"
else
  echo "No PSQL set and container '$CONTAINER' is not running." >&2
  echo "Start it with:  docker compose up -d postgres" >&2
  exit 69
fi
