import 'server-only';

/**
 * WHAT THE PROGRAM SAID TO DO — RESOLVED ONCE, FOR EVERY SCREEN THAT ASKS.
 *
 * Three screens need the same answer to the same question: *which of this
 * program's rows are this session's?* The console asks it to draw today's grid,
 * `/sessions/:id` asks it to show an upcoming session's targets, and the same
 * page asks it again to say which planned exercises a finished session actually
 * covered. This module is the single answer, because three copies of the ordinal
 * day rule is three chances for the plan a trainer reads on Monday to disagree
 * with the plan the console draws on Tuesday.
 */

export interface ProgramExerciseWire {
  id: string;
  exerciseId: string;
  sets: number | null;
  reps: number | null;
  restSeconds: number | null;
  targetLoad: number | null;
  dayOfWeek: number | null;
  week: number | null;
  orderIndex: number;
  notes?: string | null;
}

/**
 * Which of a program's rows are this session's.
 *
 * Template days are **ordinal slots**, not weekdays — `dayOfWeek` on the row is
 * "day 1", "day 2", and the booking carries which one it is in `templateDay`.
 * A booking with no `templateDay` gets the whole program, because a program with
 * one day is the common shape and hiding it would draw an empty grid.
 *
 * `week` follows the same law the week strip draws: a week with nothing of its
 * own **repeats week 1**. So the rows for this week are taken if they exist and
 * week 1's are used when they do not — rather than showing a trainer an empty
 * Tuesday in week 6 of an authored-for-four-weeks block.
 */
export function rowsForDay(
  rows: ProgramExerciseWire[],
  templateDay: number | null,
  week: number,
): ProgramExerciseWire[] {
  const day = rows.filter((r) => templateDay == null || (r.dayOfWeek ?? 1) === templateDay);
  const thisWeek = day.filter((r) => (r.week ?? 1) === week);
  const source = thisWeek.length ? thisWeek : day.filter((r) => (r.week ?? 1) === 1);
  return [...source].sort((a, b) => a.orderIndex - b.orderIndex);
}

/**
 * Which week of the block a given day falls in, counting from the start date.
 *
 * Both arguments are `'YYYY-MM-DD'` and both are parsed at local midnight, so a
 * session and a start date on the same calendar day are week 1 rather than
 * week 1 or 2 depending on which side of UTC the trainer is standing. A program
 * with no start date has no weeks to count, and reads as week 1.
 */
export function programWeek(startDate: string | null, sessionDate: string): number {
  if (!startDate) return 1;
  const from = Date.parse(`${startDate}T00:00:00`);
  const at = Date.parse(`${sessionDate}T00:00:00`);
  if (Number.isNaN(from) || Number.isNaN(at)) return 1;
  return Math.max(1, Math.floor((at - from) / 604_800_000) + 1);
}
