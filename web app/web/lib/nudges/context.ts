import 'server-only';

import { listRecentNudges } from './api';
import { COOLDOWN_DAYS, lastContactMap } from './cooldown';

/**
 * THE NUDGE CONTEXT AND THE CLOCK THAT MEASURES IT, READ TOGETHER.
 *
 * `LastContactProvider` needs both halves and they are useless apart: a stamp
 * with no clock to measure it against is a note `NudgeButton` cannot honestly
 * draw, which is why that component refuses to read `Date.now()` itself.
 *
 * ── WHY THIS IS A FUNCTION AND NOT TWO LINES IN A LAYOUT ─────────────────────
 *
 * The clock. `react-hooks/purity` refuses `Date.now()` in a component body —
 * trap 20, and it is right: a layout that reads the clock during render reads a
 * different one on every re-render, and the browser then disagrees with the HTML
 * it is hydrating. A plain `async` function is not a component, so the read is
 * legal here and the instant arrives as a value the layout can only pass on.
 *
 * `lib/today/api.ts` and `lib/money/api.ts` both take the same shape for the
 * same reason — `now` is a field on the payload, stamped where it was fetched.
 */
export async function lastContactContext(): Promise<{
  now: number;
  map: Record<string, number>;
}> {
  const now = Date.now();
  /* Cannot fail the screen: `listRecentNudges` answers `[]`. */
  const nudges = await listRecentNudges(COOLDOWN_DAYS);
  return { now, map: Object.fromEntries(lastContactMap(nudges)) };
}
