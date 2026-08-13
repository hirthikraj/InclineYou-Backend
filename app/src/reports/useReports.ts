/**
 * Subscribes reports and adherence to local storage.
 *
 * Five subscriptions, none of them windowed. That looks wasteful next to a query
 * with a date bound, and it is the right trade: the Reports screen's own range
 * switcher moves between 7 days, 30 days and a year, and re-subscribing on every
 * tap would tear the whole set down and rebuild it while the trainer is still
 * deciding. A trainer's entire history is a few thousand rows.
 *
 * This is also where the design's second refusal is kept. Nothing here calls the
 * server: adherence is computed on the phone, on the frame it is drawn, from
 * rows that are already on disk. That is what makes a Tuesday miss show on
 * Tuesday, and what makes the screen work on a gym floor with no signal.
 */

import { useEffect, useMemo, useState } from 'react';
import { InteractionManager } from 'react-native';
import { combineLatest, map } from 'rxjs';
import { database } from '../db';
import type ClientModel from '../db/models/Client';
import type ScheduledSessionModel from '../db/models/ScheduledSession';
import type PaymentModel from '../db/models/Payment';
import type ProgramModel from '../db/models/Program';
import type WorkingHoursModel from '../db/models/WorkingHours';
import { liveCache } from '../db/live';
import { EMPTY_REPORT_INPUT, type ReportInput } from './reports';

/** Nothing on these screens turns over faster than a day. */
const TICK_MS = 300_000;

const clients = database.get<ClientModel>('clients');
const sessions = database.get<ScheduledSessionModel>('scheduled_sessions');
const payments = database.get<PaymentModel>('payments');
const programs = database.get<ProgramModel>('programs');
const hours = database.get<WorkingHoursModel>('working_hours');

/** The last emission, so a re-mount paints real figures on its first frame. */
const cache = liveCache<ReportInput>(EMPTY_REPORT_INPUT);

export interface Reports {
  input: ReportInput;
  now: number;
  /**
   * False only until the first emission of the app's life.
   *
   * These screens make strong empty claims — "nothing delivered yet", "no
   * clients to score" — and none of them may be shown before the tables have
   * actually been read.
   */
  ready: boolean;
}

/**
 * @param active The screen's focus state. Nothing recomputes behind another screen.
 */
export function useReports(active: boolean = true): Reports {
  const [now, setNow] = useState(() => Date.now());
  const [input, setInput] = useState(cache.value);
  const [ready, setReady] = useState(cache.ready);

  useEffect(() => {
    if (!active) return;
    // After the push transition, not during it — the same reason every other
    // screen in this app defers its first recompute.
    const task = InteractionManager.runAfterInteractions(() => setNow(Date.now()));
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => {
      task.cancel();
      clearInterval(t);
    };
  }, [active]);

  useEffect(() => {
    // `observeWithColumns`, not `observe`: a session going from scheduled to
    // no-show does not change the SET of rows, and a no-show that doesn't move
    // the adherence strip is the exact failure this screen exists to avoid.
    const sub = combineLatest([
      clients
        .query()
        .observeWithColumns(['name', 'status', 'sessions_per_week', 'delivery_mode', 'updated_at']),
      sessions
        .query()
        .observeWithColumns(['scheduled_at', 'status', 'duration_minutes', 'delivery_mode']),
      payments.query().observeWithColumns(['amount', 'status', 'paid_at']),
      programs.query().observeWithColumns(['name', 'status', 'client_id']),
      hours.query().observeWithColumns(['weekday', 'start_minute', 'end_minute']),
    ])
      .pipe(
        map(([c, s, p, pr, h]) => ({
          clients: c,
          sessions: s,
          payments: p,
          programs: pr,
          // Named out rather than spread: a WatermelonDB model's columns are
          // prototype getters, so `{ ...row }` yields an object with none of the
          // data on it. That mistake cost this codebase a day once already.
          hours: h.map((row) => ({
            weekday: row.weekday,
            startMinute: row.startMinute,
            endMinute: row.endMinute,
          })),
        })),
      )
      .subscribe((next) => {
        cache.set(next);
        setInput(next);
        setReady(true);
      });

    return () => sub.unsubscribe();
  }, []);

  return useMemo(() => ({ input, now, ready }), [input, now, ready]);
}
