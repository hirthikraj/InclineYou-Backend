/**
 * Subscribes the sync queue to the two things that move it.
 *
 * The queue changes when a write lands and when a push succeeds, and neither is
 * a WatermelonDB query — the dirty state lives on the records themselves, and
 * nothing observes it. So this re-reads on `pendingCount`, which the sync module
 * already recomputes at exactly those two moments, rather than polling.
 *
 * The name maps are ordinary live queries, because a queued payment should say
 * "Ravi Kannan" the instant his row arrives, and `name` is the only column
 * either of them cares about.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { InteractionManager } from 'react-native';
import { combineLatest, map } from 'rxjs';
import { database } from '../db';
import type ClientModel from '../db/models/Client';
import type ExerciseModel from '../db/models/Exercise';
import { pendingChanges, type PendingChange } from '../db/pending';
import { refreshPending } from '../db/sync';
import { useSyncState } from '../db/useSync';
import { buildQueue, NO_NAMES, type QueueNames, type QueueView } from './queue';

const clients = database.get<ClientModel>('clients');
const exercises = database.get<ExerciseModel>('exercises');

export interface Queue {
  view: QueueView;
  /**
   * False until the queue has actually been read once.
   *
   * The screen's empty state says "everything is on the server", which is a
   * strong claim and must never be shown on the strength of an empty array we
   * have not filled yet.
   */
  ready: boolean;
  /** Pull-to-refresh, which here means "look again", not "fetch". */
  reread: () => void;
}

export function useQueue(active: boolean = true): Queue {
  const sync = useSyncState();
  const [changes, setChanges] = useState<PendingChange[]>([]);
  const [names, setNames] = useState<QueueNames>(NO_NAMES);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  /** @param alive Read after the screen is gone is a wasted setState, not a crash. */
  const read = useCallback((alive: () => boolean = () => true) => {
    void pendingChanges().then((next) => {
      if (!alive()) return;
      setChanges(next);
      setNow(Date.now());
      setReady(true);
    });
  }, []);

  // `pendingCount` and `phase` between them cover every moment the queue can
  // have moved: a local write bumped the count, a push emptied it, a failure
  // left it where it was and changed the reason.
  useEffect(() => {
    if (!active) return;
    let alive = true;
    const task = InteractionManager.runAfterInteractions(() => read(() => alive));
    return () => {
      alive = false;
      task.cancel();
    };
  }, [active, read, sync.pendingCount, sync.phase]);

  useEffect(() => {
    const sub = combineLatest([
      clients.query().observeWithColumns(['name']),
      exercises.query().observeWithColumns(['name']),
    ])
      .pipe(
        map(([c, e]) => ({
          clients: new Map(c.map((row) => [row.id, row.name])),
          exercises: new Map(e.map((row) => [row.id, row.name])),
        })),
      )
      .subscribe(setNames);
    return () => sub.unsubscribe();
  }, []);

  const reread = useCallback(() => {
    void refreshPending();
    read();
  }, [read]);


  const view = useMemo(
    () =>
      buildQueue(
        changes,
        names,
        { phase: sync.phase, lastSyncedAt: sync.lastSyncedAt, error: sync.error },
        now,
      ),
    [changes, names, sync.phase, sync.lastSyncedAt, sync.error, now],
  );

  return useMemo(() => ({ view, ready, reread }), [view, ready, reread]);
}
