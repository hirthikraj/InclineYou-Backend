/**
 * Everything a client is allowed to write — and it is a short file on purpose.
 *
 * The tap map for the client role has thirty-odd entries and only five of them
 * change anything: a set, a weight, a confirmed move, and the two log paths that
 * already live in `db/log.ts`. Everything else reads, opens a WhatsApp draft, or
 * hands the payment to a bank app.
 *
 * The server enforces the same list independently (`ClientSyncService`), because
 * a rule that only exists on the phone is a rule a future build can forget.
 */

import { Q } from '@nozbe/watermelondb';
import { database } from './index';
import type BodyMetricModel from './models/BodyMetric';
import type ScheduledSessionModel from './models/ScheduledSession';
import { refreshPending, syncDatabase } from './sync';
import { logBodyMetric as appendBodyMetric } from './clients';

const metrics = database.get<BodyMetricModel>('body_metrics');
const sessions = database.get<ScheduledSessionModel>('scheduled_sessions');

function after(reason: string) {
  void refreshPending();
  void syncDatabase(reason);
}

/**
 * Log a body metric. Append-only, and the screen says so in those words.
 *
 * A reading is never overwritten: if the client typed 6.18 and meant 61.8, the
 * correction is another entry and the newest one wins on every screen that reads
 * the latest. The series their trainer coaches from is the series that was
 * actually recorded, which is the whole reason FR-1 makes this append-only.
 */
export async function logBodyMetric(
  clientId: string,
  metricType: string,
  value: number,
  unit = 'kg',
): Promise<string> {
  // Delegated rather than duplicated. Both roles write the same row into the
  // same table under the same append-only rule, and two creators would be two
  // places for that rule to stop being true.
  return appendBodyMetric(clientId, metricType, value, unit);
}

/**
 * Undo for the five seconds after a save.
 *
 * The one deletion a client can perform, and it is not a correction path — it
 * takes back a tap that had not landed anywhere yet. A reading older than the
 * toast is history, and history is corrected by adding to it.
 */
export async function undoBodyMetric(id: string): Promise<void> {
  const row = await metrics.find(id);
  await database.write(() => row.markAsDeleted());
  after('undo-body-metric');
}

/**
 * Confirm a session the trainer moved.
 *
 * The client's whole half of a reschedule. It writes one column and deliberately
 * nothing else: they cannot move, cancel or no-show a session, because all three
 * change somebody else's working day and two of them move a pack. And it never
 * touches the pack — a move never deducts, which is the sentence on the card.
 *
 * Idempotent. Confirming twice, or confirming here after confirming on WhatsApp,
 * is the same tap.
 */
export async function confirmMove(sessionId: string): Promise<void> {
  const session = await sessions.find(sessionId);
  if (session.clientConfirmedAt) return;
  await database.write(() =>
    session.update((s) => {
      s.clientConfirmedAt = new Date();
    }),
  );
  after('confirm-move');
}

/** Their own sessions, for a screen that needs to count rather than observe. */
export async function countBookedSessions(clientId: string, fromMs: number): Promise<number> {
  return sessions
    .query(Q.where('client_id', clientId), Q.where('scheduled_at', Q.gte(fromMs)))
    .fetchCount();
}
