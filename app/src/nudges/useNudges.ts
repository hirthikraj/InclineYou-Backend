/**
 * Subscribes the nudge rules and everything they read to local storage.
 *
 * Six subscriptions, and the reason there are six rather than one endpoint is
 * that the waiting list is derived. A rule says something about the data *right
 * now*, so the drafts have to be recomputed when a session is logged, a pack
 * runs down or a debt is settled — and every one of those is a local write.
 * A queue table would have been one subscription and would eventually have held
 * a reminder to chase money that arrived on Tuesday.
 */

import { useEffect, useMemo, useState } from 'react';
import { InteractionManager } from 'react-native';
import { combineLatest, map } from 'rxjs';
import { database } from '../db';
import type NudgeRuleModel from '../db/models/NudgeRule';
import type ClientModel from '../db/models/Client';
import type ScheduledSessionModel from '../db/models/ScheduledSession';
import type PackageModel from '../db/models/Package';
import type PaymentModel from '../db/models/Payment';
import type NudgeLogModel from '../db/models/NudgeLog';
import { liveCache } from '../db/live';
import { EMPTY_NUDGE_INPUT, type NudgeInput } from './rules';

/**
 * Five minutes.
 *
 * The send window opens at 9am and the cooldown is measured in days, so nothing
 * here changes faster than that — and a one-minute tick would re-derive every
 * draft in the app twelve times an hour for no visible difference.
 */
const TICK_MS = 300_000;

const rules = database.get<NudgeRuleModel>('nudge_rules');
const clients = database.get<ClientModel>('clients');
const sessions = database.get<ScheduledSessionModel>('scheduled_sessions');
const packages = database.get<PackageModel>('packages');
const payments = database.get<PaymentModel>('payments');
const logs = database.get<NudgeLogModel>('nudge_logs');

const cache = liveCache<NudgeInput>(EMPTY_NUDGE_INPUT);

export interface Nudges {
  input: NudgeInput;
  now: number;
  ready: boolean;
}

export function useNudges(active: boolean = true): Nudges {
  const [now, setNow] = useState(() => Date.now());
  const [input, setInput] = useState(cache.value);
  const [ready, setReady] = useState(cache.ready);

  useEffect(() => {
    if (!active) return;
    const task = InteractionManager.runAfterInteractions(() => setNow(Date.now()));
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => {
      task.cancel();
      clearInterval(t);
    };
  }, [active]);

  useEffect(() => {
    const sub = combineLatest([
      rules
        .query()
        .observeWithColumns(['kind', 'threshold', 'action', 'message', 'enabled', 'order_index']),
      clients.query().observeWithColumns(['name', 'phone', 'status']),
      sessions.query().observeWithColumns(['scheduled_at', 'status']),
      packages
        .query()
        .observeWithColumns(['sessions_remaining', 'amount', 'status', 'due_date', 'written_off_at']),
      payments.query().observeWithColumns(['amount', 'status', 'paid_at', 'package_id']),
      logs.query().observeWithColumns(['status', 'sent_at', 'template_name', 'channel']),
    ])
      .pipe(
        map(([r, c, s, pkg, pay, l]) => ({
          rules: r,
          clients: c,
          sessions: s,
          packages: pkg,
          payments: pay,
          logs: l,
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
