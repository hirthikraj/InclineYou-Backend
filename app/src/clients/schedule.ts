/**
 * The client's weekly slots — the one serializer, and the onboarding gate.
 *
 * `clients.weekly_schedule` is JSON, canonically `[{templateDay, weekday, time}]`
 * with `weekday` 1 = Monday and `time` "HH:mm" 24-hour — the shape
 * `diary.ts`'s `usualSlots` documents and reads, and the same weekday/time pair
 * `applyTemplate` sends the server. `templateDay` is the ordinal slot the day
 * will carry when a plan lands on it: Day 1 on the earliest weekday, which is
 * the only order a training week means.
 *
 * The onboarding rule lives here too, derived rather than stored: a client is
 * in the routine once their week is picked AND a live plan sits on it. Deriving
 * it from the two facts means resume can never disagree with the data — there
 * is no flag to go stale on either side of a sync.
 */

import { DAY_MS, startOfWeek } from '../home/time';

/** One usual slot. `weekday` 1 = Monday … 7 = Sunday; `time` "HH:mm". */
export interface WeeklySlot {
  templateDay: number;
  weekday: number;
  time: string;
}

export function parseWeeklySchedule(raw: string | null | undefined): WeeklySlot[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const slots = parsed.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const { templateDay, weekday, day, time } = entry as {
        templateDay?: unknown;
        weekday?: unknown;
        day?: unknown;
        time?: unknown;
      };
      if (typeof time !== 'string' || !/^\d{1,2}:\d{2}$/.test(time)) return [];
      // `day` as a 0-based alias, matching the diary's tolerant read.
      const wd =
        typeof weekday === 'number' ? weekday : typeof day === 'number' ? day + 1 : null;
      if (wd === null || wd < 1 || wd > 7) return [];
      return [{ templateDay: typeof templateDay === 'number' ? templateDay : 0, weekday: wd, time }];
    });
    const ordered = slots.sort((a, b) => a.weekday - b.weekday);
    // Slots written without an ordinal (or with a stale one) get theirs back
    // from week order, so a parsed schedule is always usable as an apply layout.
    return ordered.map((s, i) => ({ ...s, templateDay: i + 1 }));
  } catch {
    return [];
  }
}

export function serializeWeeklySchedule(slots: WeeklySlot[]): string {
  const ordered = [...slots].sort((a, b) => a.weekday - b.weekday);
  return JSON.stringify(ordered.map((s, i) => ({ ...s, templateDay: i + 1 })));
}

/**
 * What a client still owes before they are part of the routine.
 *
 * Only a client who has never actually trained is chased: pre-existing clients
 * with logged workouts are already in the routine, whatever their record says —
 * nagging them to "finish setup" would be the app telling a working trainer
 * their working roster is wrong.
 */
export function onboardingStep(input: {
  weeklySchedule?: string | null;
  hasLiveProgram: boolean;
  hasWorkouts: boolean;
}): 'schedule' | 'plan' | null {
  if (input.hasWorkouts) return null;
  if (parseWeeklySchedule(input.weeklySchedule).length === 0) {
    return input.hasLiveProgram ? null : 'schedule';
  }
  return input.hasLiveProgram ? null : 'plan';
}

/** "07:30" → minutes from midnight, or null for anything that isn't a clock time. */
export function timeToMinute(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const minute = Number(match[1]) * 60 + Number(match[2]);
  return minute >= 0 && minute < 24 * 60 ? minute : null;
}

/**
 * The next `count` session starts of a standing week, earliest first.
 *
 * Unlike the diary's `occurrencesFor`, each weekday carries its own minute —
 * a 6am Monday and an 8pm Thursday is an ordinary client. Starts strictly
 * after `from`, so booking "from now" never books a slot already in the past
 * today. DST-safe the same way the diary is: each start is derived from the
 * day's own midnight, never by adding hours across a clock change.
 *
 * `limitWeeks` is a runaway guard, not a feature: at 26 weeks a caller asking
 * for more sessions than half a year holds gets half a year, which is already
 * further than any pack or program reaches.
 */
export function slotOccurrences(
  from: number,
  slots: { weekday: number; minute: number }[],
  count: number,
  limitWeeks = 26,
): number[] {
  if (count <= 0 || slots.length === 0) return [];
  const week = [...slots].sort((a, b) => a.weekday - b.weekday);
  const out: number[] = [];
  for (let w = 0; w < limitWeeks && out.length < count; w += 1) {
    const weekBase = startOfWeek(from) + w * 7 * DAY_MS;
    for (const slot of week) {
      if (out.length >= count) break;
      const day = new Date(weekBase + (slot.weekday - 1) * DAY_MS);
      day.setHours(0, slot.minute, 0, 0);
      if (day.getTime() > from) out.push(day.getTime());
    }
  }
  return out;
}
