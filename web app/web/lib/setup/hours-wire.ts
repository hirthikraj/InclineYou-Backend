import type { HourWindow } from './hours';

/**
 * The working week on the v1.1 wire, and the two conversions at its edge.
 *
 * `GET /v1/working-hours` answers `{id, weekday, start, end}` with **weekday 1 =
 * Monday … 7 = Sunday** and times as `"HH:mm"`. Everything on this half — the
 * pickers, `mergeWindows`, the day strip — counts **0 = Monday … 6 = Sunday** in
 * minutes since midnight, and that is the model every screen is written
 * against. So the translation happens here, once, on the way in and the way out,
 * and nothing past `lib/setup/api.ts` and `lib/profile/api.ts` ever sees a 1–7 weekday or a clock string.
 *
 * Pure and not `server-only`: both data layers (`lib/setup/api.ts`,
 * `lib/profile/api.ts`) use it and neither should own the other's copy.
 */

/** One row of `GET /v1/working-hours`. */
export interface WorkingHourWire {
  id: string;
  weekday: number;
  start: string;
  end: string;
}

/** A stored window in this half's model: weekday 0–6, minutes since midnight. */
export interface StoredWindow extends HourWindow {
  id: string;
  /** 0 = Monday … 6 = Sunday. ISO order, NOT `Date.getDay()`. */
  weekday: number;
}

function minutesOf(clock: unknown): number | null {
  if (typeof clock !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(clock);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** `390` → `"06:30"`. The server refuses anything but zero-padded `HH:mm`. */
export function clockOf(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * The wire's rows as this half's. A row that cannot be read (an unknown weekday,
 * a time that does not parse, an end that does not follow its start) is dropped
 * rather than drawn as a zero-width window — the same filter both readers had
 * before the wire changed.
 */
export function hoursFromWire(rows: WorkingHourWire[] | null | undefined): StoredWindow[] {
  const out: StoredWindow[] = [];
  for (const r of rows ?? []) {
    const startMinute = minutesOf(r.start);
    const endMinute = minutesOf(r.end);
    if (!r.id || startMinute === null || endMinute === null) continue;
    if (!Number.isInteger(r.weekday) || r.weekday < 1 || r.weekday > 7) continue;
    if (endMinute <= startMinute) continue;
    out.push({ id: r.id, weekday: r.weekday - 1, startMinute, endMinute });
  }
  return out;
}

/**
 * One `PATCH /v1/working-hours` body for the weekdays that changed.
 *
 * `windows: []` is a rest day, which is how a day is closed — there is no delete.
 * Only the listed days are touched server-side, so a caller that passes just the
 * days whose answer changed cannot flatten a differing Saturday on the way past.
 */
export function daysToWire(
  changes: { weekday: number; windows: HourWindow[] }[],
): { days: { weekday: number; windows: { start: string; end: string }[] }[] } {
  return {
    days: changes.map((c) => ({
      weekday: c.weekday + 1,
      windows: c.windows.map((w) => ({ start: clockOf(w.startMinute), end: clockOf(w.endMinute) })),
    })),
  };
}
