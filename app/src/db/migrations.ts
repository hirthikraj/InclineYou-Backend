import { schemaMigrations } from '@nozbe/watermelondb/Schema/migrations';

/**
 * On-device schema migrations, kept in lockstep with the backend's Flyway
 * migrations and following the same additive-only contract.
 *
 * Empty, because this is a BASELINE. The eighteen steps that took the device
 * schema from v1 to v19 were flattened away on 11 Sep 2026, at the same time
 * and for the same reason as the backend's forty-two Flyway migrations: the
 * product was renamed to InclineYou, nothing was deployed, and the WatermelonDB
 * database name changed from `xrep` to `inclineyou` — so every installed build
 * opens a database that has never existed before and there is no device
 * anywhere with a v1..v18 schema to carry forward. `schema.ts` already
 * describes the whole current shape, so version 1 of it IS the end state those
 * eighteen steps reached. The old steps are in git history.
 *
 * The adapter must still be constructed with a migrations spec even while this
 * is empty, otherwise `migrationsEnabledAtVersion` in the sync engine is
 * rejected ("Migration syncs cannot be enabled on a database that does not
 * support migrations").
 *
 * From here the old law applies again. When a column or table is added, bump
 * `schema.version` and append a step here, e.g.:
 *
 *   migrations: [
 *     {
 *       toVersion: 2,
 *       steps: [addColumns({ table: 'exercises', columns: [{ name: 'level', type: 'string', isOptional: true }] })],
 *     },
 *   ]
 *
 * Never write a destructive step — trainers' phones carry old data we can't refetch.
 */
export const migrations = schemaMigrations({
  migrations: [],
});
