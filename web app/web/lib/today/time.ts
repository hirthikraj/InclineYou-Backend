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

/**
 * 12-hour, split so the meridiem can be set in its own smaller type.
 *
 * ── THE HOUR LOST ITS LEADING ZERO, TO AGREE WITH `formatMinute` ────────────
 *
 * This has always been the 12-hour one - it is what the session rows and the
 * hero clock use - but it padded the hour, so it read `07:00 AM` while
 * `formatMinute` read `07:00` and the two never had to agree. They do now:
 * `formatMinute` is 12-hour as of this pass, and `/sessions` saying `07:00 AM`
 * beside `/schedule` saying `7:00 AM` is the same string formatted two ways on
 * two screens showing the same booking.
 *
 * The padding cost nothing to drop. `.srow__t` is a `min-width:40px` column, so
 * the rows stay aligned on the box rather than on the character count, and
 * `tabular-nums` was already doing the part that actually matters.
 */
export function clockParts(at: number): { time: string; meridiem: string } {
  const d = new Date(at);
  const h24 = d.getHours();
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return {
    time: `${h}:${String(d.getMinutes()).padStart(2, '0')}`,
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

/**
 * "9 Aug 2026" — a RECORD's stamp, not a booking's.
 *
 * `dayStamp` leads with the weekday and drops the year, which is right for a
 * session this week and wrong for *created on*: nobody asks which weekday a
 * workout template was written, and a shelf spanning two years that prints both
 * as "9 Aug" is a column that sorts wrong to the eye.
 */
export function dateStamp(at: number): string {
  const d = new Date(at);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
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

/**
 * ── THE CLOCK IS 12-HOUR, AND IT IS NOT A PREFERENCE ────────────────────────
 *
 * `9:12 AM`. This returned `09:12` and every one of its ~80 call sites now reads
 * differently, which is the point: the trainers this is built for read a clock
 * with a meridiem on it. `17:00` is not a harder way of saying five in the
 * afternoon, it is a DIFFERENT sentence to an audience that does not use it —
 * and this app puts a time on the screen more often than any other kind of fact.
 *
 * One function rather than a per-screen choice, because the alternative is
 * `/today` saying **17:00** and `/schedule` saying **5:00 PM** about the same
 * session — and `Clock.tsx`'s own comment already records that bug being fixed
 * once in the other direction.
 *
 * ── NOT ZERO-PADDED, WHICH IS A DECISION AND NOT A SIMPLIFICATION ───────────
 *
 * `9:12 AM`, never `09:12 AM`. A leading zero on a 12-hour clock is not a form
 * anyone writes, and the padding was never decoration: it bought COLUMN
 * ALIGNMENT for the `tabular-nums` gutter and the block's `.ev__t`. That
 * alignment is now bought by right-aligning the gutter — `.cw__tl` is
 * `right:8px` and always was — and it is worth less than the padding costs,
 * because a padded 12-hour time reads as a typo where a padded 24-hour one reads
 * as a timetable.
 *
 * ── AND MACHINE VALUES GO SOMEWHERE ELSE ────────────────────────────────────
 *
 * `formatMinuteValue` below, and it is not an optional tidy. `<input
 * type="time">` takes its `value` as 24-hour `HH:MM` ALWAYS, whatever the
 * browser then chooses to render — it renders a 12-hour field on an en-IN
 * locale by itself. Feeding this function's output to one silently blanks the
 * control: the value fails to parse, React sets it to empty, and `Starts`
 * arrives at the booking panel with no time in it.
 */
export function formatMinute(minute: number): string {
  const m = Math.max(0, Math.round(minute));
  const h24 = Math.floor(m / 60) % 24;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m % 60).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}

/**
 * `09:12` — 24-hour, zero-padded, and for MACHINES only.
 *
 * This is what `formatMinute` used to be, kept under a name that says who it is
 * for. Exactly two consumers, both `<input type="time">` — the booking panel's
 * `Starts` and the working-hours pickers — because that element's value format
 * is 24-hour `HH:MM` by specification and has nothing to do with what it shows
 * the trainer. Never put this on the screen.
 */
export function formatMinuteValue(minute: number): string {
  const m = Math.max(0, Math.round(minute));
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * `09:12` back to 552. The inverse of `formatMinuteValue`, and it exists for the
 * one caller that STORES a time as a 24-hour string rather than as minutes —
 * `AssignPanel`, whose slots are handed on in that shape. Returns `null` for
 * anything that is not `HH:MM`, so a half-typed value can be ignored rather
 * than read as midnight.
 */
export function parseMinuteValue(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * `6 AM`, `12 PM`, `6:30 AM` — the TIME AXIS's form, where every other label is
 * the same word.
 *
 * A vertical ruling of `6:00 AM` / `7:00 AM` / `8:00 AM` spends its whole width
 * on `:00 AM` repeated fourteen times, and the gutter is 58px wide. The hour is
 * the only part that varies on an hour mark, so it is the only part drawn — the
 * `:00` carries nothing a row of hour lines has not already said.
 *
 * The meridiem stays on every row rather than only where it flips. It is two
 * characters, it is the thing a 24-hour reader is here to stop doing arithmetic
 * about, and a gutter that says it once at `12 PM` makes every other label
 * depend on the reader having seen that one.
 *
 * Quarter and half marks keep their minutes, because there the minutes are the
 * whole reason the label exists.
 */
export function formatHourMark(minute: number): string {
  const m = Math.max(0, Math.round(minute));
  const h24 = Math.floor(m / 60) % 24;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  const mer = h24 < 12 ? 'AM' : 'PM';
  return m % 60 === 0 ? `${h} ${mer}` : `${h}:${String(m % 60).padStart(2, '0')} ${mer}`;
}

/**
 * `7:00-8:00 AM`, and `11:30 AM-12:15 PM` when the two halves disagree.
 *
 * ── THE SHARED MERIDIEM IS SAID ONCE, AND THAT IS WHAT MAKES IT FIT ─────────
 *
 * A booking's start and end are the same fact and a trainer reads them as one.
 * Spelling both meridiems gives `7:00 AM-8:00 AM`, 17 characters, which at
 * 10.5px mono is ~107px — wider than a split lane on a week grid, so the label
 * would have been dropped from exactly the blocks that need it most. Collapsing
 * the repeat gives 14, which is ~88px, which is one character wider than the
 * `07:00-08:00` this replaces.
 *
 * So the range fits everywhere the old 24-hour range fitted, and the fallback
 * ladder in `SessionBlock` is the same one it always was.
 *
 * When the pair straddles noon or midnight both are spelled, because that is the
 * one case where dropping one would be wrong rather than merely terse — and it
 * is also the case a trainer most needs to see, since it is the only way to tell
 * a 30-minute session from an 11-hour typo.
 */
export function formatMinuteRange(from: number, to: number): string {
  const a = formatMinute(from);
  const b = formatMinute(to);
  const merA = a.slice(-2);
  return merA === b.slice(-2) ? `${a.slice(0, -3)}-${b}` : `${a}-${b}`;
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
 * Which of §01's twelve avatar tokens a client gets, AS A COLOUR.
 *
 * Keyed off the client id rather than their position in a list, so the colour is
 * the same on the rail, in the ribbon and in the queue — and the same tomorrow,
 * when the list is in a different order. The tokens run 1…12.
 *
 * ── IT RETURNS `var(--tx-av-3)` AND NOT `--tx-av-3`, AND THAT IS THE FIX ─────
 *
 * It used to return the property NAME, which made every one of its twenty call
 * sites responsible for wrapping it — and four of them got it wrong, in the two
 * ways a bare name can be got wrong:
 *
 *   `background: avatarToken(id)`            → `--tx-av-7`, not a colour at all
 *   `background: `var(--tx-av-${token})``    → `var(--tx-av---tx-av-7)`
 *
 * Both are dropped by the parser, so the avatar fell back to no background —
 * and `.av` paints its initials in `#fff`, which on a light panel is white on
 * white. FOUND BY RENDERING the book panel: a column of client names with an
 * invisible circle where each avatar should be. The book panel, the session
 * panel, the session list and the session detail were all drawing nothing.
 *
 * Returning the finished `var()` makes both mistakes unrepresentable: there is
 * no longer a wrapping step to forget or to do twice.
 *
 * ── IT IS NOW THE ONLY ONE ────────────────────────────────────────
 *
 * There were three: this, `avatarTint` in `lib/setup/options.ts` (name-keyed,
 * modulo inside the loop), and a private `avatarColor` in `components/team/
 * Team.tsx` (name-keyed, `>>> 0`). Three hashes over two different keys, so a
 * client in a coach's roster on the team screen and the same client on the
 * clients screen were different colours — the exact failure the id key exists
 * to prevent. Both others are deleted; their call-sites call this.
 */
export function avatarToken(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) % 1_000_003;
  return `var(--tx-av-${(hash % 12) + 1})`;
}
