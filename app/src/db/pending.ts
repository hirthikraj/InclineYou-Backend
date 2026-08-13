/**
 * What is waiting to reach the server, broken down by what it actually is.
 *
 * `sync.ts` already counts the queue, and a count is enough for a badge. It is
 * not enough for the sign-out screen, which asks a trainer to decide whether to
 * lose it: **"2 changes haven't synced"** is unanswerable, where "a payment from
 * Karthik and one logged session" is a decision anybody can make in a second.
 *
 * Built on `fetchLocalChanges`, the same function `synchronize` uses to assemble
 * a push, so this is exactly what would go out. It lives under `sync/impl` and is
 * not part of WatermelonDB's public surface — so a version that moves it makes
 * this return an empty list, the sign-out screen falls back to its count, and
 * nothing throws. That degradation is the reason every path here is guarded.
 */

import fetchLocalChanges from '@nozbe/watermelondb/sync/impl/fetchLocal';
import { database } from './index';

export interface PendingLine {
  table: string;
  /** What it is, in the trainer's words. Never a table name. */
  label: string;
  /** What is at stake if it is lost, or how it got there. */
  detail: string;
  count: number;
}

/**
 * Table names in the trainer's language, ordered by what it costs to lose one.
 *
 * A payment first. That is the whole reason this screen blocks: money recorded in
 * a gym basement and then signed away is the failure a trainer does not come back
 * from. A nudge log last — losing one means a reminder might be sent twice.
 */
const TABLES: { table: string; label: string; detail: string }[] = [
  {
    table: 'payments',
    label: 'Recorded payments',
    detail: 'Money you wrote down. Losing one means the client shows as unpaid.',
  },
  {
    table: 'packages',
    label: 'Packs sold or changed',
    detail: 'A pack bought, written off, or its due date set.',
  },
  {
    table: 'gym_settlements',
    label: "Gym's cut",
    detail: "A month's settlement marked due or paid.",
  },
  {
    table: 'workout_sessions',
    label: 'Logged workouts',
    detail: 'A session you logged on the floor.',
  },
  { table: 'set_logs', label: 'Logged sets', detail: 'The weights and reps inside those workouts.' },
  {
    table: 'scheduled_sessions',
    label: 'Diary changes',
    detail: 'Sessions booked, moved, cancelled or marked done.',
  },
  { table: 'clients', label: 'Client details', detail: 'Somebody added, edited or paused.' },
  { table: 'body_metrics', label: 'Measurements', detail: 'Weight and body metrics you took.' },
  { table: 'packs', label: 'Price list', detail: 'A pack added to or retired from what you sell.' },
  { table: 'programs', label: 'Assigned programs', detail: "A program on a client's plan." },
  { table: 'program_exercises', label: 'Program exercises', detail: 'Exercises inside those plans.' },
  { table: 'templates', label: 'Programs', detail: 'A template renamed or its length set.' },
  { table: 'exercises', label: 'Your own exercises', detail: 'Exercises you created.' },
  { table: 'exercise_favourites', label: 'Starred exercises', detail: 'Which exercises you starred.' },
  { table: 'nudge_rules', label: 'Nudge rules', detail: 'A rule turned on, off, or edited.' },
  {
    table: 'nudge_logs',
    label: 'Sent reminders',
    detail: 'A record that you messaged somebody. Losing one may mean asking twice.',
  },
  { table: 'working_hours', label: 'Working hours', detail: 'When you are open.' },
  { table: 'time_blocks', label: 'Blocked time', detail: 'Days and afternoons you blocked out.' },
];

/** WatermelonDB types `changes` as an index signature, so the values need naming. */
interface TableChanges {
  created: unknown[];
  updated: unknown[];
  deleted: unknown[];
}

export async function pendingSummary(): Promise<PendingLine[]> {
  let changes: Record<string, TableChanges>;
  try {
    const local = await fetchLocalChanges(database);
    changes = local.changes as unknown as Record<string, TableChanges>;
  } catch {
    return [];
  }

  const lines: PendingLine[] = [];
  const seen = new Set<string>();

  for (const entry of TABLES) {
    const table = changes[entry.table];
    if (!table) continue;
    const count =
      (table.created?.length ?? 0) + (table.updated?.length ?? 0) + (table.deleted?.length ?? 0);
    if (count > 0) lines.push({ ...entry, count });
    seen.add(entry.table);
  }

  // A table this build has no wording for still has to be counted — silently
  // dropping it would understate what is at stake, which is the one thing this
  // function must not do.
  let unlabelled = 0;
  for (const [name, table] of Object.entries(changes)) {
    if (seen.has(name)) continue;
    unlabelled +=
      (table?.created?.length ?? 0) + (table?.updated?.length ?? 0) + (table?.deleted?.length ?? 0);
  }
  if (unlabelled > 0) {
    lines.push({
      table: '_other',
      label: 'Other changes',
      detail: 'Records this version of the app has no name for yet.',
      count: unlabelled,
    });
  }

  return lines;
}
