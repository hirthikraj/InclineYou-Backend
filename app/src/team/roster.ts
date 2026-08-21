/**
 * The team's roster, derived.
 *
 * Pure, like every other derivation module here: rows and `now` come in, a view
 * model goes out, nothing reads the database or the clock.
 *
 * ── What this adds over the response ─────────────────────────────────────
 *
 * The server already groups by coach and orders the groups. What it cannot
 * usefully do is decide what a date *means*, which is the only reason an admin
 * opens this screen at all. "Last session 19 Jun" is a fact; **"quiet 23 days"
 * is the reason to do something about it.** Turning one into the other needs
 * `now`, and `now` belongs in the caller rather than in a SQL query whose answer
 * would be cached.
 *
 * The drift thresholds match the roster's own (`clients/roster.ts`): a client is
 * quiet at 10 days, and worth escalating at 21. Two screens disagreeing about
 * what "quiet" means is worse than either threshold being wrong.
 */

import { dayStamp } from '../home/time';

/** Quiet enough to notice. Same threshold the trainer's own roster uses. */
export const QUIET_DAYS = 10;
/** Quiet enough that the coach probably has not noticed. */
export const DRIFTING_DAYS = 21;

const DAY_MS = 86_400_000;

export interface TeamRosterClientInput {
  id: string;
  name: string;
  goal: string | null;
  status: string;
  coachTrainerId: string;
  coachName: string | null;
  lastSessionAt: number | null;
  upcomingSessions: number;
  hasActiveProgram: boolean;
}

export interface TeamRosterCoachInput {
  trainerId: string;
  coachName: string | null;
  role: string;
  clients: TeamRosterClientInput[];
}

/** What the row says under the name, and how loudly. */
export type DriftTone = 'ok' | 'warn' | 'danger';

export interface TeamRosterClient extends TeamRosterClientInput {
  /** "Trained 2 days ago" · "Quiet 23 days" · "Never logged". */
  activity: string;
  tone: DriftTone;
  /** The thing to fix, when there is one. At most one per row. */
  gap: string | null;
  isMine: boolean;
}

export interface TeamRosterCoach {
  trainerId: string;
  coachName: string;
  role: string;
  /** "12 clients · 2 drifting" — the line that makes the group worth collapsing. */
  summary: string;
  drifting: number;
  clients: TeamRosterClient[];
  isMe: boolean;
}

export interface TeamRosterView {
  coaches: TeamRosterCoach[];
  totalClients: number;
  /** Across the whole team. The number an owner actually came for. */
  totalDrifting: number;
  empty: boolean;
}

export function buildTeamRoster(
  input: TeamRosterCoachInput[],
  meTrainerId: string | null,
  now: number,
): TeamRosterView {
  const coaches = input.map<TeamRosterCoach>((bucket) => {
    const clients = bucket.clients.map((client) => card(client, meTrainerId, now));
    const drifting = clients.filter((c) => c.tone === 'danger').length;
    return {
      trainerId: bucket.trainerId,
      coachName: bucket.coachName?.trim() || 'Coach',
      role: bucket.role,
      drifting,
      summary: summarise(clients.length, drifting),
      clients,
      isMe: bucket.trainerId === meTrainerId,
    };
  });

  const totalClients = coaches.reduce((sum, c) => sum + c.clients.length, 0);
  return {
    coaches,
    totalClients,
    totalDrifting: coaches.reduce((sum, c) => sum + c.drifting, 0),
    empty: totalClients === 0,
  };
}

function card(
  client: TeamRosterClientInput,
  meTrainerId: string | null,
  now: number,
): TeamRosterClient {
  const days = client.lastSessionAt == null
    ? null
    : Math.max(0, Math.floor((now - client.lastSessionAt) / DAY_MS));

  return {
    ...client,
    activity: activityLine(client.lastSessionAt, days),
    tone: tone(days),
    gap: gap(client, days),
    isMine: client.coachTrainerId === meTrainerId,
  };
}

/**
 * Never a bare date.
 *
 * "19 Jun" makes the reader do the subtraction, and the whole job of this screen
 * is that somebody has already done it. The date survives only past a month,
 * where "quiet 74 days" stops carrying information a date would not.
 */
function activityLine(lastSessionAt: number | null, days: number | null): string {
  if (lastSessionAt == null || days == null) return 'Never logged a session';
  if (days === 0) return 'Trained today';
  if (days === 1) return 'Trained yesterday';
  if (days < QUIET_DAYS) return `Trained ${days} days ago`;
  if (days <= 31) return `Quiet ${days} days`;
  return `Last trained ${dayStamp(lastSessionAt).split(' · ')[1]}`;
}

function tone(days: number | null): DriftTone {
  if (days == null) return 'warn';
  if (days >= DRIFTING_DAYS) return 'danger';
  if (days >= QUIET_DAYS) return 'warn';
  return 'ok';
}

/**
 * One gap per row, in the order an admin would act on them.
 *
 * A client with no plan AND nothing booked has two problems and one row; naming
 * both turns a list into a paragraph. Drifting outranks both, because a client
 * who has stopped coming is the only one of the three that is already going
 * wrong rather than merely unfinished.
 */
function gap(client: TeamRosterClientInput, days: number | null): string | null {
  if (days != null && days >= DRIFTING_DAYS) return 'Not training';
  if (!client.hasActiveProgram) return 'No plan';
  if (client.upcomingSessions === 0) return 'Nothing booked';
  return null;
}

function summarise(clients: number, drifting: number): string {
  const head = clients === 1 ? '1 client' : `${clients} clients`;
  return drifting === 0 ? head : `${head} · ${drifting} not training`;
}
