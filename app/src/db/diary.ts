/**
 * Diary writes — screen 05 · FR-2.
 *
 * Every rule this file enforces comes from §07 of the design:
 *
 *   · A pack moves on `done` or `no_show`, never on `booked`. Booking is a
 *     plan, and a plan is not a purchase.
 *   · Every pack change is undoable for 24 hours, exactly — which is why the
 *     delta and the package it came off are stamped onto the session rather
 *     than recomputed from the status later.
 *   · Four statuses and no more: scheduled, done, no_show, cancelled. Who
 *     cancelled is a separate nullable field, not a fifth status.
 *   · The trainer's own booking ignores working hours and blocks. Settings
 *     exist to constrain clients, not the person who set them.
 *
 * Local-first throughout: every function writes to SQLite and returns, then
 * kicks a best-effort sync. Nothing here waits on the network.
 */

import { Q } from '@nozbe/watermelondb';
import { database } from './index';
import ScheduledSessionModel from './models/ScheduledSession';
import BatchModel from './models/Batch';
import PackageModel from './models/Package';
import WorkingHoursModel from './models/WorkingHours';
import TimeBlockModel from './models/TimeBlock';
import { refreshPending, syncDatabase } from './sync';
import type { DeliveryMode } from '../home/mode';

export const scheduledSessionsCollection =
  database.get<ScheduledSessionModel>('scheduled_sessions');
export const packagesCollection = database.get<PackageModel>('packages');
export const workingHoursCollection = database.get<WorkingHoursModel>('working_hours');
export const timeBlocksCollection = database.get<TimeBlockModel>('time_blocks');

/** §07: every pack change from this screen is undoable for this long. */
export const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The four statuses, and no more. */
export type SessionStatus = 'scheduled' | 'done' | 'no_show' | 'cancelled';

export type CancelledBy = 'client' | 'trainer';

/* ------------------------------------------------------------------ reading */

export function observeWorkingHours() {
  return workingHoursCollection.query(Q.sortBy('weekday', Q.asc)).observe();
}

export function observeTimeBlocks() {
  return timeBlocksCollection.query(Q.sortBy('starts_at', Q.asc)).observe();
}

export const batchesCollection = database.get<BatchModel>('batches');

/* ------------------------------------------------------------------ batches */

/** What a floor holds, and the number below which it isn't worth running. */
export const BATCH_CAPACITY = 10;
export const BATCH_MIN = 4;

export function observeBatches() {
  return batchesCollection.query(Q.sortBy('created_at', Q.desc)).observe();
}

/**
 * Turns a slot into a batch.
 *
 * The batch record is created first and every attendee's existing session is
 * stamped with it — nothing is re-booked, nothing loses its pack history, and a
 * session that was already marked done stays done. A batch is a grouping, not a
 * new kind of booking.
 */
export async function createBatch(
  trainerId: string,
  name: string,
  sessionIds: string[],
  capacity: number = BATCH_CAPACITY,
  minSize: number = BATCH_MIN,
): Promise<string> {
  const sessions = await Promise.all(sessionIds.map((id) => scheduledSessionsCollection.find(id)));

  const batch = await database.write(async () => {
    const created = await batchesCollection.create((b) => {
      b.trainerId = trainerId;
      b.name = name.trim() || 'Batch';
      b.capacity = capacity;
      b.minSize = minSize;
    });
    await database.batch(
      ...sessions.map((session) =>
        session.prepareUpdate((s) => {
          s.batchId = created.id;
        }),
      ),
    );
    return created;
  });

  await refreshPending();
  syncDatabase('create-batch');
  return batch.id;
}

/** Books somebody into an existing batch, at the batch's own slot. */
export async function addToBatch(
  batchId: string,
  base: Omit<BookInput, 'seriesId'>,
): Promise<ScheduledSessionModel> {
  const created = await database.write(async () =>
    scheduledSessionsCollection.create((s) => {
      s.trainerId = base.trainerId;
      s.clientId = base.clientId;
      s.scheduledAt = new Date(base.at);
      s.durationMinutes = base.durationMinutes;
      s.status = 'scheduled';
      if (base.programId) s.programId = base.programId;
      if (base.mode) s.deliveryMode = base.mode;
      s.batchId = batchId;
    }),
  );

  await refreshPending();
  syncDatabase('add-to-batch');
  return created;
}

/**
 * Marks every attendee of a batch done.
 *
 * One tap, and one pack deduction **per person** — stamped individually, so each
 * stays undoable on its own for 24 hours. A batch is eight sessions that share a
 * room, and the moment this pretends otherwise the undo stops being exact.
 *
 * Attendees already closed off are skipped rather than charged twice, which is
 * what makes this safe to tap again after adding somebody late.
 */
export async function markBatchDone(sessionIds: string[]): Promise<number> {
  const sessions = (
    await Promise.all(sessionIds.map((id) => scheduledSessionsCollection.find(id).catch(() => null)))
  ).filter((s): s is ScheduledSessionModel => s !== null && s.status === 'scheduled');

  let charged = 0;
  for (const session of sessions) {
    const pack = await chargeablePack(session.clientId);
    await database.write(async () => {
      if (pack) {
        await pack.update((p) => {
          p.sessionsRemaining = Math.max(0, (p.sessionsRemaining ?? 0) - 1);
        });
      }
      await session.update((s) => {
        s.status = 'done';
        s.packDelta = pack ? -1 : 0;
        s.packPackageId = pack ? pack.id : (null as unknown as string);
        s.packAppliedAt = new Date();
      });
    });
    if (pack) charged += 1;
  }

  await refreshPending();
  syncDatabase('batch-done');
  return charged;
}

/* ------------------------------------------------------------------ booking */

export interface BookInput {
  trainerId: string;
  clientId: string;
  /** Local epoch millis for the start. */
  at: number;
  durationMinutes: number;
  mode?: DeliveryMode;
  programId?: string;
  seriesId?: string;
}

/**
 * One session, booked.
 *
 * Deliberately does not check working hours, blocks or clashes. The clash sheet
 * asks the question before calling this, and answering "book it anyway" has to
 * actually book it anyway — an app that forbids two clients on one floor at
 * once is an app that gets worked around.
 */
export async function bookSession(input: BookInput): Promise<ScheduledSessionModel> {
  const created = await database.write(async () =>
    scheduledSessionsCollection.create((s) => {
      s.trainerId = input.trainerId;
      s.clientId = input.clientId;
      s.scheduledAt = new Date(input.at);
      s.durationMinutes = input.durationMinutes;
      s.status = 'scheduled';
      if (input.programId) s.programId = input.programId;
      if (input.mode) s.deliveryMode = input.mode;
      if (input.seriesId) s.seriesId = input.seriesId;
    }),
  );

  await refreshPending();
  syncDatabase('book-session');
  return created;
}

/**
 * A recurring booking, as real rows.
 *
 * A series is a set of sessions created together, not a rule evaluated at read
 * time: the trainer can then move or cancel any one of them without the others
 * arguing about it, and an offline device can read next month without
 * re-deriving anything.
 *
 * @param occurrences already bounded by the caller — the sheet defaults to
 *   "until the pack runs out", because nobody should be booked into sessions
 *   they have not paid for.
 */
export async function bookSeries(
  base: Omit<BookInput, 'at' | 'seriesId'>,
  occurrences: number[],
): Promise<string> {
  // A client-generated id, like every other id in this app — the series has to
  // be stable before it has ever reached the server.
  const seriesId = `series_${Math.random().toString(36).slice(2)}${occurrences[0] ?? 0}`;

  await database.write(async () => {
    await database.batch(
      ...occurrences.map((at) =>
        scheduledSessionsCollection.prepareCreate((s) => {
          s.trainerId = base.trainerId;
          s.clientId = base.clientId;
          s.scheduledAt = new Date(at);
          s.durationMinutes = base.durationMinutes;
          s.status = 'scheduled';
          if (base.programId) s.programId = base.programId;
          if (base.mode) s.deliveryMode = base.mode;
          s.seriesId = seriesId;
        }),
      ),
    );
  });

  await refreshPending();
  syncDatabase('book-series');
  return seriesId;
}

/** Moving never touches the pack. The client gets the message; the count doesn't move. */
export async function moveSession(sessionId: string, at: number): Promise<void> {
  const session = await scheduledSessionsCollection.find(sessionId);
  const was = session.scheduledAt;
  await database.write(async () => {
    await session.update((s) => {
      // What it WAS, kept for the client's side of this (FR-11 · 4b): their
      // notice shows the old time struck through, because a client shown only
      // the new time cannot tell what changed and will ask — which is the
      // WhatsApp exchange the notice exists to replace. The FIRST move is the
      // one that gets remembered; moving twice before they confirm still shows
      // them the time they had in their head.
      if (!s.movedFromAt && was) s.movedFromAt = was;
      // And the answer they gave is about the old time, so it goes.
      s.clientConfirmedAt = null;
      s.scheduledAt = new Date(at);
      // A moved session is live again, whatever it was before.
      if (s.status === 'cancelled') s.status = 'scheduled';
    });
  });
  await refreshPending();
  syncDatabase('move-session');
}

/* -------------------------------------------------------------- the outcome */

/**
 * The pack a session should be charged to.
 *
 * The oldest active pack with something left on it. A pack already at zero is
 * spent, not the one to charge — same rule `endSession` uses, and they have to
 * agree or the two ways of closing a session would disagree about the money.
 */
async function chargeablePack(clientId: string): Promise<PackageModel | undefined> {
  const packs = await packagesCollection
    .query(
      Q.where('client_id', clientId),
      Q.where('type', 'session_pack'),
      Q.where('status', 'active'),
      Q.sortBy('created_at', Q.asc),
    )
    .fetch();
  return packs.find((p) => (p.sessionsRemaining ?? 0) > 0);
}

/**
 * Marks a session as not-trained and decides the money in one write.
 *
 * `no_show` costs a session; both kinds of cancellation don't. That single
 * difference is the only thing that matters about these three outcomes, which
 * is why the sheet states it inside each option rather than in a confirmation
 * afterwards.
 */
export async function markNotTrained(
  sessionId: string,
  outcome: 'no_show' | 'cancelled',
  by?: CancelledBy,
): Promise<void> {
  const session = await scheduledSessionsCollection.find(sessionId);
  const charge = outcome === 'no_show';
  const pack = charge ? await chargeablePack(session.clientId) : undefined;

  await database.write(async () => {
    if (pack) {
      await pack.update((p) => {
        p.sessionsRemaining = Math.max(0, (p.sessionsRemaining ?? 0) - 1);
      });
    }
    await session.update((s) => {
      s.status = outcome;
      s.cancelledBy = outcome === 'cancelled' ? (by ?? 'client') : (null as unknown as string);
      // Stamped even when nothing was charged: "this outcome took nothing" is
      // a fact undo needs as much as "it took one".
      s.packDelta = pack ? -1 : 0;
      s.packPackageId = pack ? pack.id : (null as unknown as string);
      s.packAppliedAt = new Date();
    });
  });

  await refreshPending();
  syncDatabase('session-outcome');
}

/** Whether the 24-hour window on this session's outcome is still open. */
export function canUndo(session: ScheduledSessionModel, now: number): boolean {
  if (session.status === 'scheduled') return false;
  const applied = session.packAppliedAt ? session.packAppliedAt.getTime() : null;
  if (applied === null) return true; // closed before this column existed
  return now - applied <= UNDO_WINDOW_MS;
}

/**
 * Puts the session and the pack back exactly as they were.
 *
 * Exactly, not approximately: the delta and the package id were stamped at the
 * time, so a renewal, a part-payment or an expiry in between cannot make this
 * credit the wrong pack. It is one tap and it is somebody's money.
 */
export async function undoOutcome(sessionId: string): Promise<void> {
  const session = await scheduledSessionsCollection.find(sessionId);
  const delta = session.packDelta ?? 0;
  const packId = session.packPackageId;

  const pack = packId
    ? await packagesCollection.find(packId).catch(() => null)
    : null;

  await database.write(async () => {
    if (pack && delta !== 0) {
      await pack.update((p) => {
        const total = p.sessionsTotal ?? Number.POSITIVE_INFINITY;
        // Give back what was taken, and never more than the pack ever held.
        p.sessionsRemaining = Math.min(total, (p.sessionsRemaining ?? 0) - delta);
      });
    }
    await session.update((s) => {
      s.status = 'scheduled';
      s.cancelledBy = null as unknown as string;
      s.packDelta = null as unknown as number;
      s.packPackageId = null as unknown as string;
      s.packAppliedAt = null as unknown as Date;
    });
  });

  await refreshPending();
  syncDatabase('undo-outcome');
}

/* ------------------------------------------------------------------- hours */

export interface HourWindow {
  startMinute: number;
  endMinute: number;
}

/**
 * Replaces one weekday's windows.
 *
 * Wholesale, not diffed: a day's hours are one idea, and reconciling two lists
 * of intervals to save a delete is a bug waiting to be written. An empty list
 * means the day is closed.
 */
export async function saveWorkingHours(
  trainerId: string,
  weekday: number,
  windows: HourWindow[],
): Promise<void> {
  const existing = await workingHoursCollection.query(Q.where('weekday', weekday)).fetch();

  await database.write(async () => {
    await database.batch(
      ...existing.map((row) => row.prepareMarkAsDeleted()),
      ...windows.map((w) =>
        workingHoursCollection.prepareCreate((row) => {
          row.trainerId = trainerId;
          row.weekday = weekday;
          row.startMinute = w.startMinute;
          row.endMinute = w.endMinute;
        }),
      ),
    );
  });

  await refreshPending();
  syncDatabase('save-working-hours');
}

/* ------------------------------------------------------------------ blocks */

export async function createTimeBlock(
  trainerId: string,
  startsAt: number,
  endsAt: number,
  allDay: boolean,
  reason?: string,
): Promise<TimeBlockModel> {
  const created = await database.write(async () =>
    timeBlocksCollection.create((b) => {
      b.trainerId = trainerId;
      b.startsAt = new Date(startsAt);
      b.endsAt = new Date(endsAt);
      b.allDay = allDay;
      if (reason) b.reason = reason;
    }),
  );

  await refreshPending();
  syncDatabase('create-time-block');
  return created;
}

export async function deleteTimeBlock(blockId: string): Promise<void> {
  const block = await timeBlocksCollection.find(blockId);
  await database.write(async () => {
    await block.markAsDeleted();
  });
  await refreshPending();
  syncDatabase('delete-time-block');
}

/**
 * Cancels several sessions at once — the "just cancel them" arm of the time-off
 * sheet. No pack is deducted, which is the sentence the option itself makes.
 */
export async function cancelSessions(sessionIds: string[], by: CancelledBy): Promise<void> {
  if (sessionIds.length === 0) return;
  const sessions = await scheduledSessionsCollection
    .query(Q.where('id', Q.oneOf(sessionIds)))
    .fetch();

  await database.write(async () => {
    await database.batch(
      ...sessions.map((s) =>
        s.prepareUpdate((row) => {
          row.status = 'cancelled';
          row.cancelledBy = by;
          row.packDelta = 0;
          row.packAppliedAt = new Date();
        }),
      ),
    );
  });

  await refreshPending();
  syncDatabase('cancel-sessions');
}
