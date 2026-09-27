/**
 * The shape every schedule write answers with, and the constants around it.
 *
 * In its own module for the rule `lib/today/hold.ts` records: a `'use server'`
 * module may export ONLY async functions, because every export becomes a callable
 * endpoint — a `const` or an `interface` sitting among them invalidates the whole
 * file, and Next reports that as "The module has no exports at all".
 */

export interface WriteResult {
  ok: boolean;
  /** What to tell the trainer. Present on every failure, and on some successes. */
  message?: string;
  /** The row that was written, so the panel can redraw without a round trip. */
  sessionId?: string;
  /** 412: the row changed elsewhere and the screen has been revalidated (R69). */
  stale?: boolean;
  /** A no-show: whether it took a session off the pack. */
  charged?: boolean;
  /** Sessions left on the pack the write touched, when it touched one. */
  sessionsRemaining?: number | null;
}

/**
 * How long a move is held in the browser before it is written.
 *
 * Nobody is told about a move in v1 (R11, decided 26 Sep): the portal's bell is
 * out of v1 and WhatsApp auto-send is v2. So the ten seconds guard against a
 * mis-placed click, not against a message — the whole write waits, and the
 * receipt offers *Message {name}* for a trainer who wants to say so.
 *
 * The cost is stated: a move is not on the server for ten seconds, so a trainer
 * who closes the tab inside them has not moved anything. That is the correct
 * reading of an undo that has not expired.
 */
export const MOVE_HOLD_SECONDS = 10;

/** `LENGTHS` in `app/src/screens/main/diary/BookSheet.tsx`, to the character. */
export const LENGTHS = [30, 45, 60, 90];

/**
 * The four offered lengths, plus the one in front of you if it is not among them.
 *
 * ── FOUND BY RENDERING REAL ROWS · A CONTROL THAT COULD NOT SHOW ITS VALUE ───
 *
 * `session_duration_minutes` is a free integer and has been since schema V2, so
 * a roster holds 75-minute clients whatever the chip row offers — two of them on
 * the first Tuesday this screen was pointed at. The panel drew four chips with
 * NONE pressed and a note underneath reading "usually trains for 75 minutes",
 * which is a control silently disagreeing with the sentence beside it.
 *
 * That is worse than untidy. An unpressed row reads as *nothing is set*, so the
 * obvious repair is to press the nearest chip — and pressing 60 on a 75-minute
 * session is a fifteen-minute truncation the trainer did not intend and the UI
 * invited. The panel must be able to show the value it holds before it offers to
 * change it.
 *
 * `LENGTHS` itself is NOT widened, and that restraint is the point: its docstring
 * pins it to `BookSheet.tsx` "to the character", and the two halves offering
 * different menus is a drift no comment survives. The extra chip is not a fifth
 * option, it is this session's own length made visible — it appears only when it
 * has to, and it disappears the moment the trainer picks one of the four.
 */
export function lengthChoices(current: number | null | undefined): number[] {
  if (current == null || !Number.isFinite(current) || current <= 0) return LENGTHS;
  if (LENGTHS.includes(current)) return LENGTHS;
  return [...LENGTHS, current].sort((a, b) => a - b);
}

/**
 * The quantum the time field steps by, on both halves.
 *
 * `TimeField.tsx`'s own comment names the case it exists for — *"the one that
 * keeps 07:30 and 06:45 reachable"* — and `conflicts.ts` reasons in
 * `[startMinute, startMinute + durationMinutes)` at the same resolution. A drag
 * on this screen snaps to it, which is why the 15-minute rulings appear only
 * while dragging: permanently they are 15px apart and read as hatching, which is
 * noise on a surface whose whole job is to be scanned.
 */
export const SNAP_MINUTES = 15;
