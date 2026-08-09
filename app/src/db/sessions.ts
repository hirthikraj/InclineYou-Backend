import { Q } from '@nozbe/watermelondb';
import { database } from './index';
import ScheduledSession from './models/ScheduledSession';
import WorkoutSession from './models/WorkoutSession';
import Client from './models/Client';
import Package from './models/Package';
import { refreshPending, syncDatabase } from './sync';

export const scheduledSessionsCollection = database.get<ScheduledSession>('scheduled_sessions');
export const workoutSessionsCollection = database.get<WorkoutSession>('workout_sessions');
export const clientsCollection = database.get<Client>('clients');
export const packagesCollection = database.get<Package>('packages');

export function observeScheduledSessions(clientId?: string) {
  const clauses = clientId ? [Q.where('client_id', clientId)] : [];
  return scheduledSessionsCollection
    .query(...clauses, Q.sortBy('scheduled_at', Q.asc))
    .observe();
}

export function observeSessionsInRange(startMs: number, endMs: number) {
  return scheduledSessionsCollection
    .query(
      Q.where('scheduled_at', Q.gte(startMs)),
      Q.where('scheduled_at', Q.lte(endMs)),
      Q.sortBy('scheduled_at', Q.asc),
    )
    .observe();
}

export function observeTodaySessions(todayStartMs: number, todayEndMs: number) {
  return scheduledSessionsCollection
    .query(
      Q.where('scheduled_at', Q.gte(todayStartMs)),
      Q.where('scheduled_at', Q.lte(todayEndMs)),
      Q.sortBy('scheduled_at', Q.asc),
    )
    .observe();
}

export async function findClientsByIds(ids: string[]): Promise<Record<string, Client>> {
  if (!ids.length) return {};
  const rows = await clientsCollection.query(Q.where('id', Q.oneOf(ids))).fetch();
  const map: Record<string, Client> = {};
  rows.forEach((c) => { map[c.id] = c; });
  return map;
}

export function observeClients() {
  return clientsCollection.query(Q.sortBy('name', Q.asc)).observe();
}

/* ------------------------------------------------------ running a session
 *
 * Starting and ending a session used to be one server call, `POST
 * /v1/sessions/{id}/done`, which did three things at once: created the workout
 * log, marked the session done and decremented the pack. That had two costs.
 *
 * It needed a connection, on the one control the home screen promises works on
 * a gym floor with no signal. And it collapsed start and end into a single
 * moment, so a session was finished the instant it began and the home screen's
 * "session running" state could never be reached.
 *
 * Both halves are now local writes that leave through the normal sync push —
 * every table involved is already handled there. The server endpoint is left in
 * place for any caller that still wants the old one-shot behaviour.
 */

/** Local date as `YYYY-MM-DD`. `toISOString` would shift an evening session a day back. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function findWorkout(sessionId: string): Promise<WorkoutSession | null> {
  const rows = await workoutSessionsCollection
    .query(Q.where('scheduled_session_id', sessionId))
    .fetch();
  return rows[0] ?? null;
}

/**
 * Opens a workout log against a scheduled session and returns its id.
 *
 * Idempotent: tapping Start twice, or starting something already under way,
 * returns the existing log rather than creating a second one. The scheduled
 * session deliberately stays `scheduled` — it is running, not done — which is
 * what the home hero reads to switch into its in-session state.
 */
export async function startSession(sessionId: string): Promise<string> {
  const existing = await findWorkout(sessionId);
  if (existing) return existing.id;

  const session = await scheduledSessionsCollection.find(sessionId);

  const workout = await database.write(async () =>
    workoutSessionsCollection.create((w) => {
      w.trainerId = session.trainerId;
      w.clientId = session.clientId;
      if (session.programId) w.programId = session.programId;
      w.scheduledSessionId = session.id;
      w.loggedBy = 'trainer';
      w.sessionDate = today();
    }),
  );

  await refreshPending();
  syncDatabase('start-session');
  return workout.id;
}

/**
 * Finishes a session: marks it done and takes one off the pack.
 *
 * Creates the workout log if there isn't one, so marking a session done without
 * having started it behaves exactly as it did before. The decrement is a plain
 * local write of the new value rather than a server-side `sessions_remaining -
 * 1`, so two devices ending sessions offline resolve last-write-wins — the same
 * trade every other field in this app makes, and the reason the pack count is
 * shown as a hint rather than an invoice.
 */
export async function endSession(sessionId: string, notes?: string): Promise<string> {
  const session = await scheduledSessionsCollection.find(sessionId);
  const existing = await findWorkout(sessionId);

  const packs = await packagesCollection
    .query(
      Q.where('client_id', session.clientId),
      Q.where('type', 'session_pack'),
      Q.where('status', 'active'),
      Q.sortBy('created_at', Q.asc),
    )
    .fetch();
  // The oldest pack with something left on it — a pack already at zero is spent,
  // not the one to charge.
  const pack = packs.find((p) => (p.sessionsRemaining ?? 0) > 0);

  const workoutId = await database.write(async () => {
    const workout =
      existing ??
      (await workoutSessionsCollection.create((w) => {
        w.trainerId = session.trainerId;
        w.clientId = session.clientId;
        if (session.programId) w.programId = session.programId;
        w.scheduledSessionId = session.id;
        w.loggedBy = 'trainer';
        w.sessionDate = today();
      }));

    if (notes && !existing) await workout.update((w) => { w.notes = notes; });

    await session.update((s) => { s.status = 'done'; });
    if (pack) await pack.update((p) => { p.sessionsRemaining = Math.max(0, p.sessionsRemaining - 1); });

    return workout.id;
  });

  await refreshPending();
  syncDatabase('end-session');
  return workoutId;
}
