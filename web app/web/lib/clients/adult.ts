/**
 * THE 18+ RULE, ONE COPY FOR THE BROWSER (MUST-22).
 *
 * `ClientWriteService.requireAdult` is the enforced one — it refuses `422
 * CLIENT_UNDER_18` for a birth date after *today minus 18 years* in the
 * workspace's calendar. This mirrors it so the sentence arrives before the round
 * trip, and so the Add client flow can say WHEN somebody turns 18 instead of just
 * "no". It runs in the browser and reads no cookie, request or clock of its own:
 * `now` is passed in, because a render must not call `Date.now()` and a test must
 * be able to pin the day.
 *
 * Two edges the server settled and this copies on purpose:
 *  · the cutoff is `today.minusYears(18)`, which Java clamps — a 29 February
 *    today has the cutoff 28 February eighteen years back, not 1 March;
 *  · on the cutoff day itself the person IS 18 (`!dob.isAfter(cutoff)`).
 */
const pad = (n: number) => String(n).padStart(2, '0');

function iso(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${pad(m + 1)}-${pad(d)}`;
}

/** The last day a person can be born and be 18 on `now` — `YYYY-MM-DD`, local calendar. */
export function adultCutoff(now: number): string {
  const t = new Date(now);
  const y = t.getFullYear() - 18;
  const m = t.getMonth();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return iso(y, m, Math.min(t.getDate(), last));
}

/** Today as `YYYY-MM-DD`, local calendar. */
export function todayIso(now: number): string {
  const t = new Date(now);
  return iso(t.getFullYear(), t.getMonth(), t.getDate());
}

export type BirthCheck = { ok: true; age: number } | { ok: false; message: string };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `12 Mar 2029` — the day they turn 18, which is the useful half of a refusal. */
function turns18(dobIso: string): string {
  const [y, m, d] = dobIso.split('-').map(Number);
  const last = new Date(Date.UTC(y + 18, m, 0)).getUTCDate();
  return `${Math.min(d, last)} ${MONTHS[m - 1]} ${y + 18}`;
}

/**
 * Is this a birth date we can accept? `value` is what `<input type="date">`
 * gives: a complete `YYYY-MM-DD`, or the empty string while it is incomplete.
 */
export function checkBirthDate(value: string, now: number): BirthCheck {
  if (!/^\d{4,6}-\d{2}-\d{2}$/.test(value)) {
    return { ok: false, message: 'That is not a date.' };
  }
  const [y, m, d] = value.split('-').map(Number);
  const real = new Date(Date.UTC(y, m - 1, d));
  if (real.getUTCMonth() !== m - 1 || real.getUTCDate() !== d) {
    return { ok: false, message: 'That is not a date.' };
  }
  if (y < 1900) return { ok: false, message: 'Check the year on that birth date.' };
  const today = todayIso(now);
  if (value > today) return { ok: false, message: 'That date is in the future.' };
  if (value > adultCutoff(now)) {
    return {
      ok: false,
      message: `Clients must be 18 or over. They turn 18 on ${turns18(value)}.`,
    };
  }
  const t = new Date(now);
  let age = t.getFullYear() - y;
  if (t.getMonth() + 1 < m || (t.getMonth() + 1 === m && t.getDate() < d)) age -= 1;
  return { ok: true, age };
}
