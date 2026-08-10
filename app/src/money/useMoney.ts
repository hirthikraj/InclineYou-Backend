/**
 * Subscribes the book to local storage.
 *
 * §08, the rule this hook exists to keep: recording money works offline, and it
 * has to — a gym basement has no signal and cash arrives there anyway. So every
 * figure on the Money screen is derived from SQLite, and the only thing that
 * needs the network is the trainer's own profile, which is cached and read
 * once per focus.
 *
 * Seven subscriptions. None of them is windowed: a trainer's whole book is a
 * few thousand rows at the outside, the year view needs twelve months of it,
 * and re-subscribing every time the month strip moves would tear the whole set
 * down mid-scroll.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { InteractionManager } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { combineLatest, map } from 'rxjs';
import { database } from '../db';
import type ClientModel from '../db/models/Client';
import type PackageModel from '../db/models/Package';
import type PaymentModel from '../db/models/Payment';
import type PackModel from '../db/models/Pack';
import type GymSettlementModel from '../db/models/GymSettlement';
import type ScheduledSessionModel from '../db/models/ScheduledSession';
import type NudgeLogModel from '../db/models/NudgeLog';
import { getTrainer } from '../api/trainer';
import { EMPTY_GYM, type GymProfile, type MoneyInput } from './money';

/** The book does not tick by the minute — a day boundary is the only thing that moves. */
const TICK_MS = 60_000;

const clients = database.get<ClientModel>('clients');
const packages = database.get<PackageModel>('packages');
const payments = database.get<PaymentModel>('payments');
const packs = database.get<PackModel>('packs');
const settlements = database.get<GymSettlementModel>('gym_settlements');
const sessions = database.get<ScheduledSessionModel>('scheduled_sessions');
const nudges = database.get<NudgeLogModel>('nudge_logs');

const EMPTY: Omit<MoneyInput, 'gym'> = {
  clients: [],
  packages: [],
  payments: [],
  packs: [],
  settlements: [],
  sessions: [],
  nudges: [],
};

export interface Money {
  input: MoneyInput;
  now: number;
  /** Null until the profile has been read once. Distinct from "no gym". */
  profileLoaded: boolean;
  reloadProfile: () => void;
}

/**
 * @param active The screen's focus state — nothing recomputes behind another tab.
 */
export function useMoney(active: boolean = true): Money {
  const [now, setNow] = useState(() => Date.now());
  const [rows, setRows] = useState(EMPTY);
  const [gym, setGym] = useState<GymProfile>(EMPTY_GYM);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileNonce, setProfileNonce] = useState(0);

  useEffect(() => {
    if (!active) return;
    // After the tab transition, not on it. Same reason as the roster and the
    // diary: this rebuild is not free and the cross-fade needs those frames.
    const task = InteractionManager.runAfterInteractions(() => setNow(Date.now()));
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => {
      task.cancel();
      clearInterval(t);
    };
  }, [active]);

  useEffect(() => {
    // `observe()` re-emits when the SET of rows changes. It does not fire when
    // a column on a row already in the set is updated — which is most of what
    // this screen does: a payment edited, a debt written off, a share settled.
    // `observeWithColumns` is the one that watches fields.
    const sub = combineLatest([
      clients.query().observeWithColumns([
        'name',
        'phone',
        'delivery_mode',
        'trainer_split_percent',
        'metadata',
      ]),
      packages
        .query(Q.sortBy('created_at', Q.desc))
        .observeWithColumns([
          'amount',
          'sessions_total',
          'sessions_remaining',
          'status',
          'start_date',
          'due_date',
          'pack_id',
          'written_off_at',
          'written_off_amount',
        ]),
      payments
        .query(Q.sortBy('paid_at', Q.desc))
        .observeWithColumns([
          'amount',
          'method',
          'collected_by',
          'status',
          'upi_reference',
          'paid_at',
          'gym_share_amount',
          'share_percent',
          'receipt_no',
          'note',
        ]),
      packs
        .query(Q.sortBy('order_index', Q.asc))
        .observeWithColumns(['name', 'type', 'sessions', 'amount', 'validity_days', 'status', 'order_index']),
      settlements
        .query(Q.sortBy('period', Q.desc))
        .observeWithColumns(['amount', 'sessions_counted', 'gym_name', 'status', 'due_at', 'settled_at']),
      // Only the mode and the outcome matter here — the gym's cut is on floor
      // sessions that actually happened.
      sessions.query().observeWithColumns(['scheduled_at', 'status', 'delivery_mode']),
      nudges.query().observe(),
    ])
      .pipe(
        map(([c, pkg, pay, pk, st, se, nu]) => ({
          clients: c,
          packages: pkg,
          payments: pay,
          packs: pk,
          settlements: st,
          sessions: se,
          nudges: nu,
        })),
      )
      .subscribe(setRows);

    return () => sub.unsubscribe();
  }, []);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    getTrainer()
      .then(({ data }) => {
        if (!alive) return;
        setGym({
          name: data.gymName ?? null,
          percent: data.gymSharePercent ?? null,
          upiVpa: data.upiVpa ?? null,
          trainerName: data.name ?? '',
        });
        setProfileLoaded(true);
      })
      .catch(() => {
        // Offline, or the server is older than this build. The book still
        // renders — it simply can't show whose money it is, and a wrong share
        // would be worse than none.
        if (alive) setProfileLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [active, profileNonce]);

  const reloadProfile = useCallback(() => setProfileNonce((n) => n + 1), []);

  const input = useMemo<MoneyInput>(() => ({ ...rows, gym }), [rows, gym]);
  return useMemo(
    () => ({ input, now, profileLoaded, reloadProfile }),
    [input, now, profileLoaded, reloadProfile],
  );
}
