/**
 * Subscribes the trainer's weekly reports to local storage.
 *
 * Two queries and no window. `weekly_reports` grows by one row per client per
 * week — a year of a full roster is under two thousand rows — and the week
 * picker moves between them freely, so bounding the query would only mean
 * tearing it down every time somebody looks back a fortnight.
 *
 * Nothing here calls the server. These rows arrive on the ordinary sync, which
 * is what lets a trainer pull up the report they sent on the 3rd while standing
 * in a basement gym with the client asking about it.
 */

import { useEffect, useMemo, useState } from 'react';
import { combineLatest, map } from 'rxjs';
import { database } from '../db';
import type ClientModel from '../db/models/Client';
import type NudgeLogModel from '../db/models/NudgeLog';
import type WeeklyReportModel from '../db/models/WeeklyReport';
import { liveCache } from '../db/live';
import { EMPTY_WEEKLY_INPUT, WEEKLY_TEMPLATE, type WeeklyInput } from './weekly';

const clients = database.get<ClientModel>('clients');
const reports = database.get<WeeklyReportModel>('weekly_reports');
const nudges = database.get<NudgeLogModel>('nudge_logs');

const cache = liveCache<WeeklyInput>(EMPTY_WEEKLY_INPUT);

export interface Weekly {
  input: WeeklyInput;
  /** False until the tables have actually been read once. */
  ready: boolean;
}

export function useWeekly(): Weekly {
  const [input, setInput] = useState(cache.value);
  const [ready, setReady] = useState(cache.ready);

  useEffect(() => {
    // `sent_at` is the column this screen exists to watch: a report going out
    // does not change the set of rows, and a delivery that does not move the
    // Sent group is the exact failure the screen would be built to avoid.
    const sub = combineLatest([
      reports.query().observeWithColumns(['sent_at', 'updated_at']),
      clients.query().observeWithColumns(['name', 'phone']),
      // The whole log, filtered in memory rather than by a Q.where on
      // `template_name`. A trainer's nudge log is a few hundred rows, and one
      // unfiltered subscription beats a query that has to be rebuilt if the
      // job's template name ever gains a sibling.
      nudges.query().observeWithColumns(['status', 'template_name', 'sent_at']),
    ])
      .pipe(
        map(([r, c, n]) => ({
          // Named out rather than spread — a WatermelonDB model's columns are
          // prototype getters, and `{ ...row }` yields an object with none of
          // the data on it.
          reports: r.map((row) => ({
            id: row.id,
            clientId: row.clientId,
            weekStart: row.weekStart,
            weekEnd: row.weekEnd,
            sessionsKept: row.sessionsKept,
            sessionsPlanned: row.sessionsPlanned,
            trainedDays: row.trainedDays,
            volumeKg: row.volumeKg,
            setsDone: row.setsDone,
            newBests: row.newBests,
            bestLine: row.bestLine,
            bestPrevious: row.bestPrevious,
            // `sent_at` on this table is set in the same INSERT that creates
            // the row — it is when the report was written, not when it went.
            writtenAt: row.sentAt ? row.sentAt.getTime() : null,
          })),
          // An empty string is as unreachable as a missing one, and the column
          // is optional in the schema even though the model types it plain.
          clients: c.map((row) => ({ id: row.id, name: row.name, phone: row.phone || null })),
          deliveries: n
            .filter((row) => row.templateName === WEEKLY_TEMPLATE)
            .map((row) => ({
              clientId: row.clientId,
              status: row.status,
              at: row.sentAt ? row.sentAt.getTime() : 0,
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

  return useMemo(() => ({ input, ready }), [input, ready]);
}
