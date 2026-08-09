import { schemaMigrations, addColumns } from '@nozbe/watermelondb/Schema/migrations';

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
  migrations: [
    {
      toVersion: 2,
      steps: [
        addColumns({
          table: 'clients',
          columns: [
            { name: 'sessions_per_week', type: 'number', isOptional: true },
            { name: 'session_duration_minutes', type: 'number', isOptional: true },
            { name: 'weekly_schedule', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 3,
      steps: [
        addColumns({
          table: 'templates',
          columns: [{ name: 'day_labels', type: 'string', isOptional: true }],
        }),
        addColumns({
          table: 'scheduled_sessions',
          columns: [{ name: 'day_label', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 4,
      steps: [
        addColumns({
          table: 'scheduled_sessions',
          columns: [{ name: 'template_day', type: 'number', isOptional: true }],
        }),
      ],
    },
    {
      // Backend V9. Floor or remote — the client's usual mode, and the
      // per-session override that beats it.
      toVersion: 5,
      steps: [
        addColumns({
          table: 'clients',
          columns: [{ name: 'delivery_mode', type: 'string', isOptional: true }],
        }),
        addColumns({
          table: 'scheduled_sessions',
          columns: [{ name: 'delivery_mode', type: 'string', isOptional: true }],
        }),
      ],
    },
  ],
});
