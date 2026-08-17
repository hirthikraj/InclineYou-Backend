/**
 * Trainer-wide slot conflicts — one trainer, one hour, one client.
 *
 * The diary deliberately *warns* about a double-booked day and never blocks
 * (§ 07): a session already on the floor is the trainer's call. This module
 * serves the other end of the funnel — the standing-week pickers, where a
 * clash isn't a judgement call but a mistake about to be repeated every week.
 * There the rule is hard: an hour another client already holds is not offered,
 * and not saveable.
 *
 * Busy hours are read from both places a standing week lives:
 * `clients.weekly_schedule` (the week picked at add-client) and live
 * `programs.schedule` (the week picked at assign time, server-written) — a
 * client scheduled through either path blocks the slot. Each slot occupies
 * `[time, time + that client's session duration)`, so a 90-minute client
 * blocks the half-hour marks inside their session too.
 *
 * Paused, inactive and archived clients don't block: their sessions are not
 * happening, and holding their hours would shrink the week for no one's
 * benefit. Unknown statuses count as active, the same tolerance the roster's
 * `readStatus` applies.
 */

import { parseProgramSchedule } from '../training/training';
import { parseWeeklySchedule, timeToMinute } from './schedule';

/** One hour another client holds. `weekday` 1 = Monday … 7 = Sunday. */
export interface BusySlot {
  weekday: number;
  startMinute: number;
  endMinute: number;
  clientId: string;
  clientName: string;
}

interface ClientLike {
  id: string;
  name: string;
  status: string;
  weeklySchedule?: string | null;
  sessionDurationMinutes?: number | null;
}

interface ProgramLike {
  clientId: string;
  status: string;
  schedule?: string | null;
}

export const DEFAULT_SLOT_MINUTES = 60;

/** Statuses whose slots are genuinely idle. Everything else blocks. */
const IDLE_CLIENT = new Set(['paused', 'on_hold', 'inactive', 'archived']);
/** Mirrors `roster.ts` / `AssignProgramScreen` — a dead program books nothing. */
const DEAD_PROGRAM = new Set(['cancelled', 'canceled', 'completed', 'archived']);

/**
 * Every hour the trainer's other clients already hold, as flat intervals.
 * `excludeClientId` is the client being (re)scheduled — their own standing
 * week never clashes with itself.
 */
export function busySlots(
  clients: ClientLike[],
  programs: ProgramLike[],
  excludeClientId?: string | null,
): BusySlot[] {
  const byId = new Map(clients.map((c) => [c.id, c]));
  const out: BusySlot[] = [];
  const seen = new Set<string>();

  const add = (client: ClientLike, weekday: number, time: string) => {
    const start = timeToMinute(time);
    if (start === null) return;
    const key = `${client.id}:${weekday}:${start}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      weekday,
      startMinute: start,
      endMinute: start + (client.sessionDurationMinutes || DEFAULT_SLOT_MINUTES),
      clientId: client.id,
      clientName: client.name,
    });
  };

  const blocks = (client: ClientLike | undefined): client is ClientLike =>
    !!client &&
    client.id !== excludeClientId &&
    !IDLE_CLIENT.has((client.status || '').toLowerCase());

  for (const client of clients) {
    if (!blocks(client)) continue;
    for (const slot of parseWeeklySchedule(client.weeklySchedule)) {
      add(client, slot.weekday, slot.time);
    }
  }

  for (const program of programs) {
    if (DEAD_PROGRAM.has((program.status || '').toLowerCase())) continue;
    const client = byId.get(program.clientId);
    if (!blocks(client)) continue;
    for (const entry of parseProgramSchedule(program.schedule)) {
      add(client, entry.weekday, entry.time);
    }
  }

  return out;
}

/**
 * The slot a proposed session would collide with, or null when the hour is
 * free. `weekday` 1 = Monday, `startMinute` from midnight — plain interval
 * overlap, ends exclusive, so back-to-back sessions are fine.
 */
export function slotClash(
  busy: BusySlot[],
  weekday: number,
  startMinute: number,
  durationMinutes: number,
): BusySlot | null {
  const end = startMinute + durationMinutes;
  for (const slot of busy) {
    if (slot.weekday !== weekday) continue;
    if (startMinute < slot.endMinute && slot.startMinute < end) return slot;
  }
  return null;
}
