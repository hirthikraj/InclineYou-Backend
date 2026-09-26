/**
 * WHERE A SOLD PACK BECOMES REAL TUESDAYS.
 *
 * A pack is a COUNT — twelve sessions, sixty days to use them. A diary is a list
 * of INSTANTS. This module is the one place on this half that turns the first
 * into the second, and it is pure and import-free so the panel can run the same
 * arithmetic the server runs:
 *
 *   · `components/clients/file/PackPanel.tsx` runs it to SHOW the trainer the
 *     twelve dates before they sell, because "12 sessions, Mon/Wed/Fri at 6am"
 *     is an arrangement somebody has to agree to, and the first date and the
 *     last date are the two facts a client actually asks about.
 *   · `backend/.../session/SessionPlanner.java` runs it to CREATE those rows on
 *     the sale, and `DiaryService` writes what it decides.
 *
 * Same list both times, by construction — the Java is a transliteration of this
 * file and the two are meant to be read side by side. The alternative is a
 * preview written here and a loop written there, and the day they disagree is
 * the day a trainer promises a client a Friday that was never booked.
 *
 * ── THE WEEKDAY CONVENTION, AND WHY IT IS 1 = MONDAY ────────────────────────
 *
 * This product has TWO weekday conventions and both are load-bearing:
 *
 *   · `working_hours.weekday` is **0 = Monday … 6 = Sunday**
 *     (`WorkingHoursService` says so on the parameter, and `lib/today/time.ts`,
 *     `lib/schedule/grid.ts` and `lib/today/day.ts` all read it that way);
 *   · `client.weeklySchedule`, `program.schedule`, `program.day_labels` and
 *     `program_exercise.day_of_week` are **1 = Monday … 7 = Sunday** —
 *     `TemplateService.validateSchedule` enforces it, V2's backfill assumes it,
 *     and the phone's `app/src/clients/schedule.ts` states it as the canonical
 *     shape of a stored slot.
 *
 * A standing slot is the SECOND kind, so this file is 1-indexed throughout and
 * never touches working hours. Anything reading both has to translate, and the
 * two places that do — the add-a-client slot picker and the portal's week —
 * now say so where they do it.
 */

/** One standing slot. `weekday` 1 = Monday … 7 = Sunday; `time` is `HH:MM`. */
export interface StandingSlot {
  /** The program's ordinal day — "Day 1" is the first day this plan trains. */
  templateDay: number;
  /** 1 = Monday … 7 = Sunday. See the note above. */
  weekday: number;
  /** `HH:MM`, 24-hour, local. */
  time: string;
}

/** One session the arrangement owes, before anything has been written down. */
export interface PlannedSession {
  /** Epoch milliseconds, local wall-clock. */
  at: number;
  templateDay: number;
  weekday: number;
}

export interface LayoutInput {
  /** The client's standing week. An empty week books nothing. */
  slots: StandingSlot[];
  /** Nothing lands before this instant. The later of "now" and the pack's start. */
  from: number;
  /**
   * How many sessions the pack owes, or null for a pack that is not counted —
   * a monthly, where the client trains their rhythm until the month runs out.
   */
  count: number | null;
  /** The pack's last usable instant, or null for a pack that does not expire. */
  until: number | null;
  /** How far ahead an UNCOUNTED pack is laid down. Four weeks, as the diary is. */
  weeks?: number;
}

/** A counted pack never lays down more than this, whatever the arithmetic says. */
const MAX_WEEKS = 52;

/** How far ahead a pack with no session count is booked. */
const OPEN_ENDED_WEEKS = 4;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `07:30` → 450. An unparseable time reads as 6am rather than throwing: the slot
 * came off a form or out of an unvalidated jsonb column, and a pack that refuses
 * to sell because one stored time is malformed is a worse answer than a session
 * booked at the hour trainers default to. `TimeField` only emits `HH:MM`, so this
 * is the guard for hand-written and legacy rows. `SessionPlanner.minutesOf` makes
 * the identical choice.
 */
export function slotMinutes(time: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time ?? '');
  if (!m) return 6 * 60;
  const minute = Number(m[1]) * 60 + Number(m[2]);
  return minute >= 0 && minute < 24 * 60 ? minute : 6 * 60;
}

/** Local midnight of whatever day `at` falls on. Never UTC — see `atLocal`. */
function startOfDay(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * 1 = Monday … 7 = Sunday, from an instant — the STANDING SLOT convention.
 *
 * Deliberately NOT `lib/today/time.ts`'s `isoWeekday`, which answers 0..6 for
 * `working_hours`. Two functions, two conventions, and a shared name between them
 * is how the two get mixed up; this one is local to the file that owns the
 * 1-indexed half.
 */
export function slotWeekday(at: number): number {
  return ((new Date(at).getDay() + 6) % 7) + 1;
}

/**
 * A day and a minute-of-day → an instant, built through `Date` rather than by
 * adding milliseconds.
 *
 * The arithmetic version is wrong by an hour twice a year anywhere that keeps
 * daylight saving, and "wrong by an hour" on this path means a client shows up
 * to a locked gym. India does not observe it and every other market this reaches
 * might, so the ms-arithmetic shortcut buys nothing and costs a timezone bug.
 */
function atLocal(day: number, minute: number): number {
  const d = new Date(day);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minute);
  return d.getTime();
}

/**
 * Read whatever a form or a wire calls a standing week into the shape above.
 *
 * Tolerant on purpose — this sits on a boundary, and `client.weekly_schedule` is
 * unvalidated jsonb written by three clients over two years. It drops a slot with
 * no usable weekday, keeps ONE slot per weekday (two sessions on one morning is
 * what `validateSchedule` already refuses on the other route), and fills a
 * missing `templateDay` from the slot's position, which is what an ordinal day IS
 * when nobody has said otherwise: the first day this client trains is Day 1.
 *
 * `day` is accepted as a 0-based alias for the same reason the phone's
 * `parseWeeklySchedule` accepts it — rows written by an older build carry it.
 * The phone, `SessionPlanner.parseSlots` and this function make the same three
 * decisions including the renumbering after the sort, and the three must not
 * drift.
 */
export function normaliseSlots(raw: unknown): StandingSlot[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  const out: StandingSlot[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const weekday =
      typeof row.weekday === 'number' ? Math.trunc(row.weekday)
      : typeof row.day === 'number' ? Math.trunc(row.day) + 1
      : 0;
    if (weekday < 1 || weekday > 7 || seen.has(weekday)) continue;
    seen.add(weekday);
    const rawDay = row.templateDay;
    out.push({
      templateDay: typeof rawDay === 'number' && rawDay > 0 ? Math.trunc(rawDay) : 0,
      weekday,
      time: typeof row.time === 'string' ? row.time : '06:00',
    });
  }
  out.sort((a, b) => a.weekday - b.weekday || slotMinutes(a.time) - slotMinutes(b.time));
  /* Numbered after the sort, so Day 1 is the first day of the client's week and
     not whichever chip they happened to press first. */
  return out.map((slot, i) => ({ ...slot, templateDay: slot.templateDay || i + 1 }));
}

/**
 * THE LAYOUT. Twelve sessions on a Mon/Wed/Fri week from the 15th → twelve dates.
 *
 * Walks forward a week at a time from the Monday of `from`, taking each slot in
 * weekday order, skipping anything that falls before `from` — a pack sold at 11am
 * on a Wednesday does not book that morning's 7am — and stopping at whichever
 * comes first: the session count, the pack's expiry, or the ceiling.
 *
 * ── WHY IT STOPS AT THE EXPIRY AND DOES NOT SHUFFLE ─────────────────────────
 *
 * A twelve-session pack on two days a week needs six weeks, and a sixty-day
 * validity gives it eight. When the window is too SHORT the honest output is a
 * short list: the trainer sees "10 of 12 fit before this pack expires" and has
 * the conversation now — sell a longer validity, add a third day, or extend it —
 * rather than discovering it in week seven. Silently squeezing the extra two in
 * somewhere would invent an arrangement nobody agreed to.
 */
export function layoutSessions(input: LayoutInput): PlannedSession[] {
  const { slots, from, count, until } = input;
  if (slots.length === 0) return [];
  if (count !== null && count <= 0) return [];

  const weeks =
    count === null
      ? (input.weeks ?? OPEN_ENDED_WEEKS)
      : Math.min(MAX_WEEKS, Math.ceil(count / slots.length) + 1);

  /* The Monday of the week `from` falls in. Week 0 then contains `from` itself,
     and the `at < from` skip below drops the slots already behind it — which is
     what makes a pack sold mid-week start on the next slot rather than next
     Monday. */
  const monday = startOfDay(from) - (slotWeekday(from) - 1) * DAY_MS;

  const out: PlannedSession[] = [];
  for (let w = 0; w < weeks; w += 1) {
    for (const slot of slots) {
      if (count !== null && out.length >= count) return out;
      const day = startOfDay(monday + (w * 7 + slot.weekday - 1) * DAY_MS);
      const at = atLocal(day, slotMinutes(slot.time));
      if (at < from) continue;
      if (until !== null && at > until) return out;
      out.push({ at, templateDay: slot.templateDay, weekday: slot.weekday });
    }
  }
  return out;
}

/**
 * `2026-09-15` → that local midnight. Null for anything else.
 *
 * Parsed field by field rather than handed to `new Date(iso)`, which reads a bare
 * date as UTC midnight: `new Date('2026-09-15')` is 05:30 on the 15th in India
 * and the 14th anywhere west of Greenwich. `package-actions.ts` makes the same
 * argument in the other direction.
 */
export function dayFromIsoDate(iso: string | null | undefined): number | null {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/** The last usable instant of an ISO day — 23:59:59.999, local. */
export function endOfIsoDate(iso: string | null | undefined): number | null {
  const day = dayFromIsoDate(iso);
  return day === null ? null : atLocal(day, 24 * 60) - 1;
}
