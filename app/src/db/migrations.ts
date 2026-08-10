import {
  schemaMigrations,
  addColumns,
  createTable,
} from '@nozbe/watermelondb/Schema/migrations';

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
    {
      // Backend V10. The diary: when the trainer works, when they are blocked
      // out, and what a session did to a pack so the 24-hour undo is exact.
      toVersion: 6,
      steps: [
        createTable({
          name: 'working_hours',
          columns: [
            { name: 'trainer_id', type: 'string', isIndexed: true },
            { name: 'weekday', type: 'number', isIndexed: true },
            { name: 'start_minute', type: 'number' },
            { name: 'end_minute', type: 'number' },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        createTable({
          name: 'time_blocks',
          columns: [
            { name: 'trainer_id', type: 'string', isIndexed: true },
            { name: 'starts_at', type: 'number', isIndexed: true },
            { name: 'ends_at', type: 'number' },
            { name: 'all_day', type: 'boolean' },
            { name: 'reason', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        addColumns({
          table: 'scheduled_sessions',
          columns: [
            { name: 'series_id', type: 'string', isOptional: true },
            { name: 'cancelled_by', type: 'string', isOptional: true },
            { name: 'pack_delta', type: 'number', isOptional: true },
            { name: 'pack_package_id', type: 'string', isOptional: true },
            { name: 'pack_applied_at', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      // Backend V11. The book: a price list the trainer defines, the gym's cut
      // going the other way, and the two facts a debt needs — when it was due,
      // and whether it was written off rather than deleted.
      toVersion: 7,
      steps: [
        createTable({
          name: 'packs',
          columns: [
            { name: 'trainer_id', type: 'string', isIndexed: true },
            { name: 'name', type: 'string' },
            { name: 'type', type: 'string' },
            { name: 'sessions', type: 'number', isOptional: true },
            { name: 'amount', type: 'number' },
            { name: 'currency', type: 'string' },
            { name: 'validity_days', type: 'number', isOptional: true },
            { name: 'status', type: 'string' },
            { name: 'order_index', type: 'number' },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        createTable({
          name: 'gym_settlements',
          columns: [
            { name: 'trainer_id', type: 'string', isIndexed: true },
            { name: 'period', type: 'string', isIndexed: true },
            { name: 'amount', type: 'number' },
            { name: 'sessions_counted', type: 'number', isOptional: true },
            { name: 'gym_name', type: 'string', isOptional: true },
            { name: 'status', type: 'string' },
            { name: 'due_at', type: 'number', isOptional: true },
            { name: 'settled_at', type: 'number', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        addColumns({
          table: 'packages',
          columns: [
            { name: 'pack_id', type: 'string', isOptional: true },
            { name: 'due_date', type: 'string', isOptional: true },
            { name: 'written_off_at', type: 'number', isOptional: true },
            { name: 'written_off_amount', type: 'number', isOptional: true },
          ],
        }),
        addColumns({
          table: 'payments',
          columns: [
            { name: 'gym_share_amount', type: 'number', isOptional: true },
            { name: 'share_percent', type: 'number', isOptional: true },
            { name: 'receipt_no', type: 'string', isOptional: true },
            { name: 'note', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
  ],
});
