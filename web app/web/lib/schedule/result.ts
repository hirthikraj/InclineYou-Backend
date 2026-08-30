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
}

/**
 * How long a move waits before the client is told.
 *
 * Ten seconds, and the same argument as the queue's — the design set's §05b makes
 * it explicitly about THIS action: the session panel's own history reads *"Moved
 * from Monday 17:00 · Nikhil asked. He was told automatically"*, so a mis-drop
 * sends a WhatsApp. Undo after the message has gone is an apology, not an undo.
 *
 * The difference from the queue is worth naming: there, the WRITE is instant and
 * only the message is held. Here the write itself is held, because a move is one
 * request that does both — `PUT /v1/sessions/{id}` changes `scheduled_at`, and
 * the notification is the backend's reaction to that change. There is no seam to
 * hold half of, so the whole thing waits in the browser and this module is only
 * ever called once the ten seconds are up.
 *
 * The cost is stated: a move is not on the server for ten seconds, so a trainer
 * who closes the tab inside them has not moved anything. That is the correct
 * reading of an undo that has not expired — nothing was promised to anyone yet.
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
