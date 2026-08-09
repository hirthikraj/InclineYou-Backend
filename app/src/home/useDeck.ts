/**
 * Subscribes the deck to local storage.
 *
 * One query per table rather than per client — the same shape `observeRoster`
 * uses, and for the same reason: a trainer's whole book is small, and seven
 * subscriptions beat 7×N. Everything paints from SQLite, so the screen is
 * correct before the network is consulted and there is no skeleton state to
 * design (state 2c).
 *
 * `now` is ticked on a timer rather than read once. The hero says "starts in
 * 34 min"; if that number is frozen from launch it is worse than absent.
 */

import { useEffect, useMemo, useState } from 'react';
import { Q } from '@nozbe/watermelondb';
import { combineLatest, map } from 'rxjs';
import { database } from '../db';
import type ClientModel from '../db/models/Client';
import type ScheduledSessionModel from '../db/models/ScheduledSession';
import type WorkoutSessionModel from '../db/models/WorkoutSession';
import type SetLogModel from '../db/models/SetLog';
import type ProgramModel from '../db/models/Program';
import type PackageModel from '../db/models/Package';
import type PaymentModel from '../db/models/Payment';
import type BodyMetricModel from '../db/models/BodyMetric';
import { ACTIVITY_DAYS, buildDeck, type Deck, type DeckInput } from './deck';
import { DAY_MS, startOfDay, startOfWeek } from './time';

/** How often the countdown and the "N days" figures are recomputed. */
const TICK_MS = 30_000;

const clients = database.get<ClientModel>('clients');
const sessions = database.get<ScheduledSessionModel>('scheduled_sessions');
const workouts = database.get<WorkoutSessionModel>('workout_sessions');
const setLogs = database.get<SetLogModel>('set_logs');
const programs = database.get<ProgramModel>('programs');
const packages = database.get<PackageModel>('packages');
const payments = database.get<PaymentModel>('payments');
const metrics = database.get<BodyMetricModel>('body_metrics');

type Raw = Omit<DeckInput, 'prSessionIds'>;

const EMPTY: Raw = {
  clients: [],
  sessions: [],
  workouts: [],
  setLogs: [],
  programs: [],
  packages: [],
  payments: [],
  metrics: [],
};

/**
 * The window everything is fetched against.
 *
 * Recomputed only when the day rolls over, not on every tick — a query range
 * that changes every 30 seconds would tear down and rebuild all seven
 * subscriptions twice a minute.
 */
function windowFor(now: number) {
  return {
    sessionsFrom: startOfWeek(now),
    sessionsTo: startOfDay(now) + 2 * DAY_MS,
    logsFrom: startOfDay(now) - (ACTIVITY_DAYS - 1) * DAY_MS,
  };
}

/**
 * @param active Pass the screen's focus state. The clock stops when the screen
 *   is not being looked at — every tick re-derives the whole deck and re-renders
 *   the screen, and doing that behind a pushed screen or another tab spends
 *   frames the visible screen needs. It catches up the moment focus returns.
 */
export function useDeck(active: boolean = true): Deck {
  const [now, setNow] = useState(() => Date.now());
  const [raw, setRaw] = useState<Raw>(EMPTY);
  const [prSessionIds, setPrSessionIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!active) return;
    // Immediately, not in 30 seconds: coming back to a countdown that is half a
    // minute stale is worse than one that was never running.
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(t);
  }, [active]);

  // Only the day matters to the query window, so the subscriptions survive
  // every tick inside the same day.
  const day = startOfDay(now);

  useEffect(() => {
    const bounds = windowFor(day);
    const sub = combineLatest([
      clients.query(Q.sortBy('name', Q.asc)).observe(),
      sessions
        .query(
          Q.where('scheduled_at', Q.gte(bounds.sessionsFrom)),
          Q.where('scheduled_at', Q.lt(bounds.sessionsTo)),
          Q.sortBy('scheduled_at', Q.asc),
        )
        .observe(),
      workouts.query().observe(),
      setLogs.query(Q.where('created_at', Q.gte(bounds.logsFrom))).observe(),
      programs.query().observe(),
      packages.query().observe(),
      payments.query().observe(),
      metrics.query().observe(),
    ])
      .pipe(
        map(
          ([c, s, w, l, pr, pk, pm, bm]): Raw => ({
            clients: c,
            sessions: s,
            workouts: w,
            setLogs: l,
            programs: pr,
            packages: pk,
            payments: pm,
            metrics: bm,
          }),
        ),
      )
      .subscribe(setRaw);

    return () => sub.unsubscribe();
  }, [day]);

  // Personal records need history the observed window deliberately doesn't
  // hold, so they're resolved separately and folded back in as an input.
  const recentWorkoutIds = useMemo(
    () =>
      raw.workouts
        .filter((w) => {
          const at = w.createdAt instanceof Date ? w.createdAt.getTime() : Number(w.createdAt);
          return at >= startOfDay(day) - (ACTIVITY_DAYS - 1) * DAY_MS;
        })
        .map((w) => w.id)
        .sort()
        .join(','),
    [raw.workouts, day],
  );

  useEffect(() => {
    let live = true;
    const ids = recentWorkoutIds ? recentWorkoutIds.split(',') : [];
    void findPrSessions(ids).then((found) => {
      if (live) setPrSessionIds(found);
    });
    return () => {
      live = false;
    };
  }, [recentWorkoutIds]);

  return useMemo(() => buildDeck({ ...raw, prSessionIds }, now), [raw, prSessionIds, now]);
}

/**
 * Which of these sessions contain a personal record.
 *
 * A PR is per client per exercise and against all of that client's history, so
 * it cannot come out of the seven-day window the feed observes. Two bounded
 * queries: the sets in these sessions, then every set ever logged for just the
 * exercises those touched. A tag we can't prove is a tag we don't show.
 */
async function findPrSessions(workoutIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (workoutIds.length === 0) return out;

  try {
    const recent = await setLogs.query(Q.where('workout_session_id', Q.oneOf(workoutIds))).fetch();
    const lifted = recent.filter((l) => (l.loadKg || 0) > 0);
    if (lifted.length === 0) return out;

    const exerciseIds = Array.from(new Set(lifted.map((l) => l.exerciseId)));
    const history = await setLogs.query(Q.where('exercise_id', Q.oneOf(exerciseIds))).fetch();

    const sessionRows = await workouts.query(Q.where('id', Q.oneOf(workoutIds))).fetch();
    const clientOf = new Map(sessionRows.map((w) => [w.id, w.clientId]));

    // Every historical set needs its client, and the ones outside this batch
    // aren't in `clientOf` yet.
    const otherIds = Array.from(
      new Set(history.map((l) => l.workoutSessionId).filter((id) => !clientOf.has(id))),
    );
    if (otherIds.length > 0) {
      const others = await workouts.query(Q.where('id', Q.oneOf(otherIds))).fetch();
      others.forEach((w) => clientOf.set(w.id, w.clientId));
    }

    const at = (l: SetLogModel) =>
      l.createdAt instanceof Date ? l.createdAt.getTime() : Number(l.createdAt);

    for (const log of lifted) {
      const clientId = clientOf.get(log.workoutSessionId);
      if (!clientId) continue;
      const earlier = history.filter(
        (h) =>
          h.exerciseId === log.exerciseId &&
          clientOf.get(h.workoutSessionId) === clientId &&
          at(h) < at(log) &&
          (h.loadKg || 0) > 0,
      );
      // The first time a client ever touches a lift is not a record, it is a
      // baseline. Tagging it would put a PR on half of every new program.
      if (earlier.length === 0) continue;
      const best = Math.max(...earlier.map((h) => h.loadKg || 0));
      if ((log.loadKg || 0) > best) out.add(log.workoutSessionId);
    }
  } catch {
    // A feed without PR tags is fine; a feed that fails to render is not.
  }

  return out;
}
