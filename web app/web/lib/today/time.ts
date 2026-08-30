/**
 * Clock and calendar helpers for the deck.
 *
 * A COPY of `app/src/home/time.ts`, function for function, with one thing added
 * and nothing changed. Copied rather than re-derived for the same reason
 * `lib/setup/meter.ts` and `lib/setup/options.ts` are copies: the phone's
 * version is the one the trainer already knows, and a second implementation of
 * `relativeMinutes` is a second opinion about how long "starts in 7 h 48 min"
 * should be — on the one screen both halves show at the same minute.
 *
 * Everything is local-time and takes `now` as an argument rather than reading
 * the clock, which is what keeps the derivation pure and, here, what lets the
 * server render a day and the browser tick the countdown without disagreeing.
 *
 * THE ADDITION: `formatMinute` and `minuteOfDay`, because the web draws a
 * MINUTE-INDEXED day and the phone does not. `working_hours` stores
 * `start_minute` / `end_minute` as minutes-since-midnight and the ribbon is one
 * pixel per minute, so translating between a timestamp and a minute is this
 * screen's most-repeated arithmetic. It lives here rather than in `day.ts` so
 * there is one definition of what minute 552 is.
 */

export const DAY_MS = 86_400_000;

export function startOfDay(at: number): number {
  const d = new Date(at);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function startOfMonth(at: number): number {
  const d = new Date(at);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

/** Monday, because a trainer's week starts when the gym gets busy again. */
export function startOfWeek(at: number): number {
  const d = new Date(startOfDay(at));
  const shift = (d.getDay() + 6) % 7; // Sunday(0) → 6
  return d.getTime() - shift * DAY_MS;
}

export function daysBetween(from: number, to: number): number {
  return Math.floor((startOfDay(to) - startOfDay(from)) / DAY_MS);
}

/** 12-hour, split so the meridiem can be set in its own smaller type. */
export function clockParts(at: number): { time: string; meridiem: string } {
  const d = new Date(at);
  const h24 = d.getHours();
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return {
    time: `${String(h).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
    meridiem: h24 < 12 ? 'AM' : 'PM',
  };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
export const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
/** Monday-first, so the index matches `working_hours.weekday`. */
export const WEEKDAYS_LONG = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];

/** "Sun · 9 Aug" — the app bar's subtitle lead, and the top bar's here. */
export function dayStamp(at: number): string {
  const d = new Date(at);
  return `${WEEKDAYS[d.getDay()]} · ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "Tuesday 11 August" — the page header's title, which has room for the words. */
export function dayLong(at: number): string {
  const d = new Date(at);
  return `${WEEKDAYS_LONG[isoWeekday(at)]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`;
}

export function monthName(at: number): string {
  return MONTHS_LONG[new Date(at).getMonth()];
}

/**
 * 0 = Monday … 6 = Sunday — `working_hours.weekday`'s convention, NOT
 * `Date.getDay()`'s, where Sunday is 0. The whole week is off by one without
 * this shift, and off by one in a way that only shows up on a Sunday.
 */
export function isoWeekday(at: number): number {
  return (new Date(at).getDay() + 6) % 7;
}

/** Minutes since midnight, local. Minute 552 is 09:12. */
export function minuteOfDay(at: number): number {
  const d = new Date(at);
  return d.getHours() * 60 + d.getMinutes();
}

/** `09:12` — 24-hour and zero-padded, the same `formatMinute` as setup's hours. */
export function formatMinute(minute: number): string {
  const m = Math.max(0, Math.round(minute));
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** `30 min`, `1 h`, `1 h 45` — on a block, where the words do not fit. */
export function formatSpan(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  return minutes % 60 === 0 ? `${minutes / 60} h` : `${Math.floor(minutes / 60)} h ${minutes % 60}`;
}

/**
 * The same span in words. `formatSpan` gives "1 h 45", which is right on a block
 * and reads as broken English inside a sentence — and the ribbon's hole label is
 * a sentence.
 */
export function spanInWords(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (h === 0) return `${rest} minutes`;
  if (rest === 0) return h === 1 ? '1 hour' : `${h} hours`;
  const fraction = { 15: '¼', 30: '½', 45: '¾' }[rest as 15 | 30 | 45];
  return fraction ? `${h}${fraction} hours` : `${h} hours ${rest} minutes`;
}

/**
 * "starts in 34 min" / "started 5 min ago". Minutes up to an hour, then hours —
 * past that the countdown is noise, and the session row already says the time.
 */
export function relativeMinutes(deltaMs: number): string {
  const mins = Math.round(deltaMs / 60_000);
  if (mins <= 0) {
    const ago = Math.abs(mins);
    if (ago < 1) return 'starting now';
    if (ago < 60) return `started ${ago} min ago`;
    return `started ${Math.round(ago / 60)} h ago`;
  }
  if (mins < 60) return `starts in ${mins} min`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest === 0 ? `starts in ${hours} h` : `starts in ${hours} h ${rest} min`;
}

/** "8 minutes ago", "Yesterday", "Sunday" — the activity feed's stamp. */
export function relativePast(at: number, now: number): string {
  const delta = Math.max(0, now - at);
  const mins = Math.round(delta / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24 && daysBetween(at, now) === 0) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = daysBetween(at, now);
  if (days === 1) return 'Yesterday';
  if (days < 7) return WEEKDAYS[new Date(at).getDay()];
  return dayStamp(at).split(' · ')[1];
}

/**
 * ₹1,24,500 — Indian grouping.
 *
 * The phone's copy carries "which `toLocaleString` gets wrong on Hermes"; a
 * browser would in fact get `en-IN` right. It is still done by hand, because
 * this figure is checked against the phone's screen by the same person and a
 * locale that resolves differently on two runtimes is a difference nobody can
 * debug from a screenshot.
 */
export function rupees(amount: number): string {
  const n = Math.round(Math.abs(amount));
  const s = String(n);
  if (s.length <= 3) return `₹${s}`;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `₹${grouped},${last3}`;
}

/** ₹18k — where the exact rupee is not the point. */
export function rupeesShort(amount: number): string {
  const n = Math.round(Math.abs(amount));
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(n % 100_000 === 0 ? 0 : 1)}L`;
  if (n >= 1_000) return `₹${Math.round(n / 1_000)}k`;
  return `₹${n}`;
}

/** `MK` from `Meera Krishnan`. Two letters, because the avatar is 24px. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Which of §01's twelve avatar tokens a client gets.
 *
 * Keyed off the client id rather than their position in a list, so the colour is
 * the same on the rail, in the ribbon and in the queue — and the same tomorrow,
 * when the list is in a different order. The design set writes these as
 * `var(--tx-av-3)`; the tokens run 1…12.
 */
export function avatarToken(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) % 1_000_003;
  return `--tx-av-${(hash % 12) + 1}`;
}
