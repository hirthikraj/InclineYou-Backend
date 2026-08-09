/**
 * Clock and calendar helpers for the deck.
 *
 * Everything here is local-time and takes `now` as an argument rather than
 * reading the clock, so the derivation stays pure and testable — the same
 * choice `clientStatusRules` makes.
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

/** "Sun · 9 Aug" — the app bar's subtitle lead. */
export function dayStamp(at: number): string {
  const d = new Date(at);
  return `${WEEKDAYS[d.getDay()]} · ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function monthName(at: number): string {
  return MONTHS_LONG[new Date(at).getMonth()];
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

/** "8 minutes ago", "Yesterday", "Sunday" — the notification centre's stamp. */
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

/** ₹1,24,500 — Indian grouping, which `toLocaleString` gets wrong on Hermes. */
export function rupees(amount: number): string {
  const n = Math.round(Math.abs(amount));
  const s = String(n);
  if (s.length <= 3) return `₹${s}`;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `₹${grouped},${last3}`;
}

/** ₹18k — for the stat rail, where the exact rupee is not the point. */
export function rupeesShort(amount: number): string {
  const n = Math.round(Math.abs(amount));
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(n % 100_000 === 0 ? 0 : 1)}L`;
  if (n >= 1_000) return `₹${Math.round(n / 1_000)}k`;
  return `₹${n}`;
}
