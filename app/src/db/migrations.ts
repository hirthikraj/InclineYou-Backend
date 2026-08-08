import { schemaMigrations } from '@nozbe/watermelondb/Schema/migrations';

/**
 * On-device schema migrations, kept in lockstep with the backend's Flyway
 * migrations and following the same additive-only contract.
 *
 * Empty at schema version 1 — but the adapter must still be constructed with a
 * migrations spec, otherwise `migrationsEnabledAtVersion` in the sync engine is
 * rejected ("Migration syncs cannot be enabled on a database that does not
 * support migrations").
 *
 * When a column or table is added, bump `schema.version` and append here, e.g.:
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
