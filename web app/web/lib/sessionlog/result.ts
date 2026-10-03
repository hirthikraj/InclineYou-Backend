import type { ExerciseWire, LogWire, SetAddedWire, SetDeletedWire, SetWriteWire } from './wire';

/**
 * WHAT A LOG WRITE ANSWERS — a value, never a throw.
 *
 * A server action that throws shows the trainer an error overlay in the middle
 * of a set; every action here answers one of these instead, so a refusal is a
 * sentence beside the control that caused it. `code` is the backend's, so a
 * caller can BRANCH on a refusal rather than parse prose — the one that matters
 * is `SET_NEEDS_VALUE`, where the right response is to open the set panel, not to
 * show an error.
 */
export type Written<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; code?: string; needsValue?: boolean };

export type SetWritten = Written<SetWriteWire>;
export type SetAddedWritten = Written<SetAddedWire>;
export type SetDeletedWritten = Written<SetDeletedWire>;
export type ExerciseWritten = Written<ExerciseWire>;
export type LogWritten = Written<LogWire>;

/**
 * HOW LONG A DELETED SET CAN BE PUT BACK — §09: undo after, never confirm before.
 * Moved from `lib/log/result.ts` with the console, so the console no longer reaches into the old layer.
 */
export const UNDO_SECONDS = 20;
