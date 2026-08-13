/**
 * Subscribes the roster to local storage.
 *
 * § 07, the first rule this screen sets: the roster paints from SQLite before
 * any network call, and the segment counts come from the same local data. A
 * chip that says "5" and then says "3" after a sync is worse than no chip, so
 * there is one source and it is the one already on the phone.
 *
 * Six subscriptions, one per table, rather than per client — same shape as
 * `useDeck` and `observeRoster`, for the same reason.
 */

import { useEffect, useMemo, useState } from 'react';
import { InteractionManager } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { combineLatest, map } from 'rxjs';
import { database } from '../db';
import type ClientModel from '../db/models/Client';
import type ProgramModel from '../db/models/Program';
import type PackageModel from '../db/models/Package';
import type PaymentModel from '../db/models/Payment';
import type WorkoutSessionModel from '../db/models/WorkoutSession';
import type ScheduledSessionModel from '../db/models/ScheduledSession';
import { liveCache } from '../db/live';
import { buildRoster, type Roster, type RosterInput } from './roster';

/** The "N days" figures move once a day; a slower tick than the deck's is fine. */
const TICK_MS = 60_000;

const clients = database.get<ClientModel>('clients');
const programs = database.get<ProgramModel>('programs');
const packages = database.get<PackageModel>('packages');
const payments = database.get<PaymentModel>('payments');
const workouts = database.get<WorkoutSessionModel>('workout_sessions');
const sessions = database.get<ScheduledSessionModel>('scheduled_sessions');

const EMPTY: RosterInput = {
  clients: [],
  programs: [],
  packages: [],
  payments: [],
  workouts: [],
  sessions: [],
};

/** The last emission, so a re-mount paints real rows on its first frame. */
const cache = liveCache<RosterInput>(EMPTY);

export interface LiveRoster extends Roster {
  /** False only until the first emission of the app's life. */
  ready: boolean;
}

/**
 * @param active The screen's focus state. Behind another tab the clock stops —
 *   every tick rebuilds the whole roster, and doing that unseen spends frames
 *   the visible tab needs.
 */
export function useRoster(active: boolean = true): LiveRoster {
  const [now, setNow] = useState(() => Date.now());
  const [raw, setRaw] = useState<RosterInput>(cache.value);
  const [ready, setReady] = useState(cache.ready);

  useEffect(() => {
    if (!active) return;
    // Catch the clock up on focus — but after the tab transition, not during
    // it. Every tick re-derives the whole roster, and spending that on the
    // frames the cross-fade is running is what makes a tab switch feel soft.
    const task = InteractionManager.runAfterInteractions(() => setNow(Date.now()));
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => {
      task.cancel();
      clearInterval(t);
    };
  }, [active]);

  useEffect(() => {
    // Same reason as the diary: `observe()` watches membership, not fields. A
    // client's chips are derived from columns on other tables — an amount going
    // overdue, a pack decrementing, a status flipping to paused — and none of
    // those create or delete a row.
    const sub = combineLatest([
      clients
        .query(Q.sortBy('name', Q.asc))
        .observeWithColumns(['name', 'phone', 'status', 'delivery_mode', 'metadata']),
      programs.query().observeWithColumns(['name', 'start_date', 'end_date', 'status']),
      packages.query().observeWithColumns(['sessions_remaining', 'sessions_total', 'status']),
      payments.query().observeWithColumns(['amount', 'status']),
      workouts.query().observe(),
      sessions.query().observeWithColumns(['scheduled_at', 'status']),
    ])
      .pipe(
        map(
          ([c, pr, pk, pm, w, s]): RosterInput => ({
            clients: c,
            programs: pr,
            packages: pk,
            payments: pm,
            workouts: w,
            sessions: s,
          }),
        ),
      )
      .subscribe((next) => {
        cache.set(next);
        setRaw(next);
        setReady(true);
      });

    return () => sub.unsubscribe();
  }, []);

  return useMemo(() => ({ ...buildRoster(raw, now), ready }), [raw, now, ready]);
}
