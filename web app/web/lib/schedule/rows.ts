import { clockParts } from '@/lib/today/time';
import { readMode } from '@/lib/today/mode';
import { DEAD_SESSION, sessionMinutes } from './roster';
import type { ScheduleSession } from './session';

/**
 * A DIARY ROW INTO THE SHAPE THE GRID REASONS IN — ON EITHER SIDE OF THE WIRE.
 *
 * No `server-only`, because this runs in two places. The page's first render
 * maps L4 on the Next server; a view switch (Day · Week · Month, ‹ ›) fetches
 * only the new window of L4 through a server action and maps it in the browser,
 * against the roster the page already holds. The other four reads don't change
 * with the view, so they are not asked for again (api-contract *Schedule*:
 * "changes view / d in the URL → L4 is fetched again with the new window").
 * One mapper, so a session drawn after a switch is drawn exactly as on load.
 */

/** L4 · `SessionReadService.SessionRow`, the fields the schedule reads. */
export interface SessionWire {
  id: string;
  clientId: string;
  scheduledAt: number;
  durationMinutes: number;
  status: string;
  deliveryMode: string | null;
  notes: string | null;
  workout: { id: string; name: string; programId: string | null; week: number | null; day: number | null } | null;
  startedAt: number | null;
  endedAt: number | null;
  charge: { packageId: string } | null;
  version: string;
}

/**
 * What a session row needs to know about its client, for EVERY client on L3 —
 * not only the bookable ones, so a past session of an archived client still
 * draws their name.
 */
export interface ClientBrief {
  name: string;
  /** `client_schedule.session_duration_minutes`. */
  minutes: number | null;
  /** `client_schedule.delivery_mode`. */
  mode: string | null;
  programId: string | null;
  programName: string | null;
  programWeeks: number | null;
}

const DONE_SESSION = new Set(['done', 'completed']);

/**
 * `live` and `late` are drawn the way Today draws them (R17): live is a log
 * opened and not closed; late is a session whose start has passed, still
 * scheduled, with no log opened.
 */
export function toSession(s: SessionWire, client: ClientBrief | undefined, now: number): ScheduleSession {
  const status = (s.status ?? '').toLowerCase();
  const done = DONE_SESSION.has(status);
  const dead = DEAD_SESSION.has(status);
  const live = status === 'scheduled' && s.startedAt !== null && s.endedAt === null;
  const { time, meridiem } = clockParts(s.scheduledAt);
  const minutes = sessionMinutes(s.durationMinutes, client?.minutes);

  return {
    id: s.id,
    clientId: s.clientId,
    clientName: client?.name?.trim() || 'Client',
    programId: s.workout?.programId ?? undefined,
    templateDay: s.workout?.day ?? undefined,
    at: s.scheduledAt,
    minutes,
    time,
    meridiem,
    detail: planLine(s, client),
    mode: readMode({ session: s.deliveryMode, client: client?.mode }),
    done,
    dead,
    live,
    late: !done && !dead && !live && s.startedAt === null && s.scheduledAt <= now,
    status,
    noShow: status === 'no_show',
    charged: s.charge !== null,
    startedAt: s.startedAt,
    version: s.version,
    notes: s.notes ?? null,
    // The booking's note only; the panel prints the text itself.
    hasNote: (s.notes ?? '').trim().length > 0,
    programName: client?.programName ?? null,
  };
}

/**
 * "Full Body B · Week 4/8" — from the workout the session trains and the plan's
 * length (R16), not from program dates, so a moved session or a paused block
 * still names the right week.
 */
function planLine(s: SessionWire, client: ClientBrief | undefined): string {
  const label = s.workout?.name?.trim() || client?.programName?.trim() || 'Session';
  const week = s.workout?.week;
  if (!week) return label;
  const weeks = s.workout?.programId && s.workout.programId === client?.programId
    ? client.programWeeks
    : null;
  return weeks ? `${label} · Week ${week}/${weeks}` : `${label} · Week ${week}`;
}

/** The rows of the grid's own days — the fetch is widened a day each side (R8). */
export function inWindow(rows: SessionWire[], from: number, to: number): SessionWire[] {
  return rows.filter((s) => s.scheduledAt >= from && s.scheduledAt < to);
}
