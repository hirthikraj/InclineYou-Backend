/**
 * One-time repairs for local data that cannot sync.
 *
 * ── Why this file exists ──────────────────────────────────────────────────────
 *
 * `bookSeries` used to mint its series id as `series_<random>` while
 * `scheduled_session.series_id` is a Postgres `uuid` and the sync push casts to
 * it. Postgres rejected every one of them.
 *
 * That would have been a broken feature. What made it a broken DEVICE is that
 * the whole push is a single transaction on the server: one unparseable id
 * rolled back the entire batch — clients, metrics, templates, sessions, logs,
 * money — and the queue retried it forever. A trainer who booked one recurring
 * series stopped syncing anything, with no visible symptom beyond a pending
 * count that never went down.
 *
 * Fixing the generator stops new ones. It does nothing for the rows already
 * sitting in the queue, which is what this does.
 *
 * ── Why it rewrites rather than clears ────────────────────────────────────────
 *
 * A series id is what "cancel the rest of these" reads to find its siblings, so
 * nulling them would unblock sync by quietly turning every recurring booking
 * into a pile of unrelated one-offs. Each distinct bad id is mapped to one fresh
 * UUID instead, so sessions booked together stay booked together.
 *
 * Safe to run on every launch: it is a no-op when there is nothing to fix, and
 * a valid UUID is never touched.
 */

import { Q, type Model } from '@nozbe/watermelondb';
import { database, uuid } from './index';
import type ScheduledSessionModel from './models/ScheduledSession';
import type PackageModel from './models/Package';

/** The shape the generator produces, and the only shape Postgres will accept. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Rewrite any non-UUID `series_id` to a UUID, preserving which sessions belong
 * together. Returns how many rows were changed — 0 on a healthy device.
 */
export async function repairSeriesIds(): Promise<number> {
  const sessions = await database
    .get<ScheduledSessionModel>('scheduled_sessions')
    .query(Q.where('series_id', Q.notEq(null)))
    .fetch();

  const broken = sessions.filter((s) => s.seriesId && !UUID_RE.test(s.seriesId));
  if (broken.length === 0) return 0;

  // One new id per OLD id, not per row — that is what keeps a series a series.
  const remapped = new Map<string, string>();
  for (const s of broken) {
    if (!remapped.has(s.seriesId)) remapped.set(s.seriesId, uuid());
  }

  await database.write(async () => {
    await database.batch(
      ...broken.map((s) =>
        s.prepareUpdate((row) => {
          row.seriesId = remapped.get(s.seriesId)!;
        }),
      ),
    );
  });

  return broken.length;
}

/* --------------------------------------------------------------- pack counts */

/** The two outcomes that cost a session. Cancellations never do. */
const CHARGING = new Set(['done', 'no_show']);

/**
 * Puts back sessions that were deducted more than once.
 *
 * `endSession` and `markNotTrained` used to subtract from the pack every time
 * they ran, with nothing checking whether that session had already been paid
 * for. Four screens can finish a session and two can mark it not-trained, so
 * finishing from the workout log and then again from the diary — or marking a
 * done session as a no-show — charged a client twice for one session. A twelve
 * session pack with one session delivered could read nine.
 *
 * `settlePack` stops new ones. This is for the counters already wrong.
 *
 * ── Why it is safe to run unattended ──────────────────────────────────────────
 *
 * Rewriting somebody's balance on a guess is worse than leaving it wrong, so
 * this only acts where the arithmetic is *provable*:
 *
 *   · Every charging session carries a `pack_applied_at` stamp. A session
 *     closed before V10 added those columns deducted without recording where
 *     from, and cannot be attributed — one of those anywhere on the client and
 *     the whole client is skipped rather than guessed at.
 *   · It only ever gives sessions BACK. If the stored count is higher than the
 *     records justify, that is a different fault with a different fix, and
 *     silently taking sessions off a client is not something to do unattended.
 *   · It never exceeds the pack's own total.
 *
 * Returns how many packs were corrected — 0 on a healthy device.
 */
export async function repairPackCounts(): Promise<number> {
  const packs = await database
    .get<PackageModel>('packages')
    .query(Q.where('type', 'session_pack'))
    .fetch();
  if (packs.length === 0) return 0;

  const sessions = await database.get<ScheduledSessionModel>('scheduled_sessions').query().fetch();

  // Clients with a closed session that predates the stamp columns. Nothing on
  // these can be attributed to a particular pack, so none of it is touched.
  const unattributable = new Set(
    sessions
      .filter((s) => CHARGING.has(s.status) && s.packAppliedAt == null)
      .map((s) => s.clientId),
  );

  const chargedTo = new Map<string, number>();
  for (const s of sessions) {
    if (!CHARGING.has(s.status)) continue;
    if (!s.packPackageId || !s.packDelta) continue;
    chargedTo.set(s.packPackageId, (chargedTo.get(s.packPackageId) ?? 0) + 1);
  }

  const wrong: { pack: PackageModel; was: number; now: number }[] = [];
  for (const pack of packs) {
    const total = pack.sessionsTotal;
    if (typeof total !== 'number' || total <= 0) continue;
    if (unattributable.has(pack.clientId)) continue;

    const stored = pack.sessionsRemaining ?? 0;
    const correct = Math.max(0, Math.min(total, total - (chargedTo.get(pack.id) ?? 0)));
    if (correct > stored) wrong.push({ pack, was: stored, now: correct });
  }

  if (wrong.length === 0) return 0;

  await database.write(async () => {
    await database.batch(
      ...wrong.map(({ pack, now }) =>
        pack.prepareUpdate((p) => {
          p.sessionsRemaining = now;
        }),
      ),
    );
  });

  for (const { pack, was, now } of wrong) {
    console.warn(`[repair] pack ${pack.id}: ${was} → ${now} sessions left`);
  }
  return wrong.length;
}

/* ------------------------------------------------------- a refused client */

/** Every table that names a client directly. */
const CLIENT_OWNED = [
  'body_metrics',
  'programs',
  'scheduled_sessions',
  'workout_sessions',
  'packages',
  'payments',
  'nudge_logs',
  'weekly_reports',
] as const;

/** …and the ones that reach a client only through a parent above. */
const VIA_PROGRAM = ['program_exercises'] as const;
const VIA_WORKOUT = ['workout_exercises', 'set_logs'] as const;

async function ownedBy(table: string, column: string, ids: string[]): Promise<Model[]> {
  if (ids.length === 0) return [];
  return database.get<Model>(table).query(Q.where(column, Q.oneOf(ids))).fetch();
}

/**
 * Erase a client the server refused, and everything hanging off them.
 *
 * The server will not create a roster row whose number belongs to a trainer or
 * to another trainer's client, and it says so in the push response. Without
 * this, that record would sit on the phone marked synced and exist nowhere else
 * — a client the trainer can open, schedule and bill, whose every write is
 * silently dropped. Worse than never having added them, because it looks fine.
 *
 * `destroyPermanently`, not `markAsDeleted`: a deletion in the queue would tell
 * the server to remove a row it never had. There is nothing to tell it.
 *
 * The cascade is not housekeeping either. A pack sold on the add screen, or the
 * starting weight written with the client, would outlive its client and push
 * forever against a `client_id` the server cannot resolve.
 *
 * Only ever called for a refusal. Removing a client the trainer actually has is
 * `setClientStatus('archived')`, which keeps the row and the books.
 */
export async function purgeLocalClient(clientId: string): Promise<number> {
  const client = await database
    .get<Model>('clients')
    .query(Q.where('id', clientId))
    .fetch();

  const direct = await Promise.all(
    CLIENT_OWNED.map((table) => ownedBy(table, 'client_id', [clientId])),
  );
  const owned = direct.flat();

  // Positional rather than read off each record's own table name, which is not
  // part of WatermelonDB's typed surface.
  const at = (table: (typeof CLIENT_OWNED)[number]) => direct[CLIENT_OWNED.indexOf(table)] ?? [];
  const programIds = at('programs').map((r) => r.id);
  const workoutIds = at('workout_sessions').map((r) => r.id);

  const children = (
    await Promise.all([
      ...VIA_PROGRAM.map((table) => ownedBy(table, 'program_id', programIds)),
      ...VIA_WORKOUT.map((table) => ownedBy(table, 'workout_session_id', workoutIds)),
    ])
  ).flat();

  const doomed = [...children, ...owned, ...client];
  if (doomed.length === 0) return 0;

  await database.write(async () => {
    await database.batch(...doomed.map((r) => r.prepareDestroyPermanently()));
  });

  console.warn(`[repair] purged refused client ${clientId} and ${doomed.length - 1} related row(s)`);
  return doomed.length;
}

/**
 * Every repair, in one call for the app to await at startup.
 *
 * Never throws. A repair that fails must not stop the app from opening — the
 * device is already in a bad state and refusing to launch would make it worse,
 * not better. It simply stays unsynced until the next attempt.
 */
export async function repairLocalData(): Promise<void> {
  try {
    const fixed = await repairSeriesIds();
    if (fixed > 0) {
      console.warn(`[repair] rewrote ${fixed} session(s) with a non-UUID series_id`);
    }
  } catch (e) {
    console.warn('[repair] local data repair failed; will retry next launch', e);
  }

  try {
    const corrected = await repairPackCounts();
    if (corrected > 0) {
      console.warn(`[repair] corrected ${corrected} over-charged pack(s)`);
    }
  } catch (e) {
    console.warn('[repair] pack count repair failed; will retry next launch', e);
  }
}
