/**
 * Subscribes the diary to local storage.
 *
 * §07, the rule this hook exists to keep: conflict checks run against local
 * data and re-run on sync. Booking has to work with no signal, so everything
 * the diary decides — free slots, clashes, how many sessions a pack has left —
 * is decided from SQLite, and the honest failure mode is a race we surface
 * rather than hide.
 *
 * Eight subscriptions, one per table. The session window is deliberately wide:
 * the month view needs six weeks either side of an anchor that the user moves
 * by swiping, and re-subscribing on every swipe would tear down and rebuild the
 * whole set mid-gesture.
 */

import { useEffect, useMemo, useState } from 'react';
import { InteractionManager } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { combineLatest, map } from 'rxjs';
import { database } from '../db';
import type ClientModel from '../db/models/Client';
import type ScheduledSessionModel from '../db/models/ScheduledSession';
import type ProgramModel from '../db/models/Program';
import type WorkoutSessionModel from '../db/models/WorkoutSession';
import type SetLogModel from '../db/models/SetLog';
import type PackageModel from '../db/models/Package';
import type WorkingHoursModel from '../db/models/WorkingHours';
import type TimeBlockModel from '../db/models/TimeBlock';
import { DAY_MS, startOfDay } from '../home/time';
import type { DiaryInput } from './diary';

/** The now line moves every minute, and it has to be believable. */
const TICK_MS = 30_000;

/** How far either side of the anchor month sessions are held in memory. */
const WINDOW_DAYS = 120;

const clients = database.get<ClientModel>('clients');
const sessions = database.get<ScheduledSessionModel>('scheduled_sessions');
const programs = database.get<ProgramModel>('programs');
const workouts = database.get<WorkoutSessionModel>('workout_sessions');
const setLogs = database.get<SetLogModel>('set_logs');
const packages = database.get<PackageModel>('packages');
const hours = database.get<WorkingHoursModel>('working_hours');
const blocks = database.get<TimeBlockModel>('time_blocks');

const EMPTY: DiaryInput = {
  clients: [],
  sessions: [],
  programs: [],
  workouts: [],
  setLogs: [],
  hours: [],
  blocks: [],
  packages: [],
};

export interface Diary {
  input: DiaryInput;
  now: number;
}

/**
 * @param anchor Any day inside the range being looked at. Only its month
 *   matters to the query window, so scrolling within a month never resubscribes.
 * @param active The screen's focus state — the clock stops behind another tab.
 */
export function useDiary(anchor: number, active: boolean = true): Diary {
  const [now, setNow] = useState(() => Date.now());
  const [input, setInput] = useState<DiaryInput>(EMPTY);

  useEffect(() => {
    if (!active) return;
    // After the tab transition, not on it — same reason as the roster: this
    // rebuild is not free and the cross-fade needs those frames.
    const task = InteractionManager.runAfterInteractions(() => setNow(Date.now()));
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => {
      task.cancel();
      clearInterval(t);
    };
  }, [active]);

  // Bucketed to the month so a day-to-day swipe never rebuilds the subscription.
  const bucket = useMemo(() => {
    const d = new Date(anchor);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, [anchor]);

  useEffect(() => {
    const from = startOfDay(bucket) - WINDOW_DAYS * DAY_MS;
    const to = startOfDay(bucket) + WINDOW_DAYS * DAY_MS;

    // `observe()` re-emits when the *set* of matching rows changes — a create or
    // a delete. It does not fire when a column on a row already in the set is
    // updated, which is most of what this screen does: marking a no-show, an
    // undo, a move. `observeWithColumns` is the one that watches fields, and
    // every column named here is one the derived diary actually reads.
    const sub = combineLatest([
      clients.query().observeWithColumns(['name', 'delivery_mode', 'weekly_schedule', 'metadata']),
      sessions
        .query(
          Q.where('scheduled_at', Q.gte(from)),
          Q.where('scheduled_at', Q.lt(to)),
          Q.sortBy('scheduled_at', Q.asc),
        )
        .observeWithColumns([
          'scheduled_at',
          'duration_minutes',
          'status',
          'delivery_mode',
          'day_label',
          'series_id',
          'cancelled_by',
          'pack_delta',
          'pack_applied_at',
        ]),
      programs.query().observeWithColumns(['name', 'start_date', 'end_date', 'status']),
      workouts.query().observe(),
      setLogs.query().observe(),
      packages.query().observeWithColumns(['sessions_remaining', 'sessions_total', 'status']),
      hours.query().observeWithColumns(['weekday', 'start_minute', 'end_minute']),
      blocks.query().observeWithColumns(['starts_at', 'ends_at', 'all_day', 'reason']),
    ])
      .pipe(
        map(
          ([c, s, pr, w, l, pk, h, b]): DiaryInput => ({
            clients: c,
            sessions: s,
            programs: pr,
            workouts: w,
            setLogs: l,
            packages: pk,
            hours: h,
            blocks: b,
          }),
        ),
      )
      .subscribe(setInput);

    return () => sub.unsubscribe();
  }, [bucket]);

  return useMemo(() => ({ input, now }), [input, now]);
}
