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
    {
      // Backend V12. Behind the drawer: the if/then rules, the star on an
      // exercise, how a custom exercise is logged, and how long a program runs.
      //
      // Nothing here for reports or adherence — both are computed on the phone
      // from sessions and workouts that already sync, which is the point: a
      // weekly server-side score hides a client who stopped on Tuesday.
      toVersion: 8,
      steps: [
        createTable({
          name: 'nudge_rules',
          columns: [
            { name: 'trainer_id', type: 'string', isIndexed: true },
            { name: 'kind', type: 'string', isIndexed: true },
            { name: 'threshold', type: 'number', isOptional: true },
            { name: 'action', type: 'string' },
            { name: 'message', type: 'string', isOptional: true },
            { name: 'enabled', type: 'boolean' },
            { name: 'order_index', type: 'number' },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        createTable({
          name: 'exercise_favourites',
          columns: [
            { name: 'trainer_id', type: 'string', isIndexed: true },
            { name: 'exercise_id', type: 'string', isIndexed: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        addColumns({
          table: 'exercises',
          columns: [{ name: 'log_type', type: 'string', isOptional: true }],
        }),
        addColumns({
          table: 'templates',
          columns: [{ name: 'weeks', type: 'number', isOptional: true }],
        }),
      ],
    },
    {
      /**
       * `templates.structure` — the blueprint, so the Programs screen can draw a
       * template's shape and list its days with no signal.
       *
       * It belongs with `weeks` in version 8 and is deliberately NOT there. By
       * the time it was needed, a device had already run version 8 as written —
       * and a migration that has run anywhere is immutable, because WatermelonDB
       * records only the version it reached, not which steps it took. Editing
       * step 8 would leave that device stamped `user_version = 8` with no
       * `structure` column and no migration that will ever add one; every insert
       * into `templates` then fails with "no such column", which is exactly how
       * this was found.
       *
       * So it gets its own version. That works from all three starting states: a
       * phone at 7 runs 8 then 9, the phone that ran the partial 8 runs 9, and a
       * fresh install takes the schema whole and runs neither.
       */
      toVersion: 9,
      steps: [
        addColumns({
          table: 'templates',
          columns: [{ name: 'structure', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      /**
       * Screen 17 · the workout log.
       *
       * One table and one column, and nothing for the personal record — §09 of
       * the design makes that a rule rather than an optimisation. A record is
       * computed every time the screen is read, so correcting a set from
       * November fixes every record that depended on it in the same frame.
       */
      toVersion: 10,
      steps: [
        createTable({
          name: 'workout_exercises',
          columns: [
            { name: 'workout_session_id', type: 'string', isIndexed: true },
            { name: 'exercise_id', type: 'string', isIndexed: true },
            { name: 'order_index', type: 'number' },
            { name: 'source', type: 'string' },
            { name: 'swapped_from_exercise_id', type: 'string', isOptional: true },
            { name: 'target_sets', type: 'number', isOptional: true },
            { name: 'target_reps', type: 'number', isOptional: true },
            { name: 'rest_seconds', type: 'number', isOptional: true },
            { name: 'removed_at', type: 'number', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        addColumns({
          table: 'workout_sessions',
          columns: [{ name: 'ended_at', type: 'number', isOptional: true }],
        }),
      ],
    },
    {
      /**
       * Screens 18–24 · the client role.
       *
       * Two tables and two columns, which is the whole storage cost of the other
       * half of the product — because the role is a lens, not an account. A
       * client's plan, sets, sessions, packs and receipts are the records their
       * trainer already has; this adds only what nobody was storing: who their
       * trainer is (`coaches`), the report that was sent rather than derived
       * (`weekly_reports`), and the two facts a moved session needs.
       */
      toVersion: 11,
      steps: [
        createTable({
          name: 'coaches',
          columns: [
            { name: 'name', type: 'string' },
            { name: 'gym_name', type: 'string', isOptional: true },
            { name: 'phone', type: 'string', isOptional: true },
            { name: 'upi_vpa', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        createTable({
          name: 'weekly_reports',
          columns: [
            { name: 'trainer_id', type: 'string', isIndexed: true },
            { name: 'client_id', type: 'string', isIndexed: true },
            { name: 'week_start', type: 'string' },
            { name: 'week_end', type: 'string' },
            { name: 'sessions_kept', type: 'number' },
            { name: 'sessions_planned', type: 'number' },
            { name: 'trained_days', type: 'string', isOptional: true },
            { name: 'volume_kg', type: 'number' },
            { name: 'sets_done', type: 'number' },
            { name: 'new_bests', type: 'number' },
            { name: 'best_line', type: 'string', isOptional: true },
            { name: 'best_previous', type: 'string', isOptional: true },
            { name: 'sent_at', type: 'number', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        addColumns({
          table: 'scheduled_sessions',
          columns: [
            { name: 'moved_from_at', type: 'number', isOptional: true },
            { name: 'client_confirmed_at', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      /**
       * Diary 3d · batches.
       *
       * One table and one nullable column. A batch is not a session with many
       * clients — every attendee keeps their own `scheduled_sessions` row and
       * they share a `batch_id`, so a pack still moves per person, one attendee
       * can no-show while the rest train, and the 24-hour undo stays exact.
       */
      toVersion: 12,
      steps: [
        createTable({
          name: 'batches',
          columns: [
            { name: 'trainer_id', type: 'string', isIndexed: true },
            { name: 'name', type: 'string' },
            { name: 'capacity', type: 'number' },
            { name: 'min_size', type: 'number' },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        addColumns({
          table: 'scheduled_sessions',
          columns: [{ name: 'batch_id', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      /**
       * V18 · the client's own consent, mirrored onto the device.
       *
       * One nullable column, and the app never writes it. `status` stays the
       * trainer's view of the arrangement — active, paused, archived — and this
       * carries the CLIENT's answer to being added at all: invited, accepted,
       * declined, paused, removed, or `unavailable` when the number turns out to
       * belong to a trainer account and no invite can ever reach it.
       *
       * Nullable because it arrives from the server, so a row written offline
       * has nothing to put here until the next pull — and a null reads as "not
       * told yet", which is the honest answer rather than a guess.
       */
      toVersion: 13,
      steps: [
        addColumns({
          table: 'clients',
          columns: [{ name: 'membership_status', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      /**
       * V14 · the gym's price list, and what came off a price at the till.
       *
       * A trainer employed at a gym sells two different things: their own packs,
       * which they price, and the gym's packages, which they don't. Both are
       * price-list entries with a name, a session count and an amount, so they
       * are the same table with an owner rather than a second table that would
       * have to be joined into every place a pack is read.
       *
       * `owner` is nullable and null means 'trainer' — every row that exists
       * today was the trainer's own, and back-filling would rewrite history to
       * say something it never said.
       *
       * `discount_amount` sits on the SOLD package, not on the pack: a discount
       * is something given to one client on one sale, and putting it on the
       * price list would change what everyone else is quoted.
       */
      toVersion: 14,
      steps: [
        addColumns({
          table: 'packs',
          columns: [{ name: 'owner', type: 'string', isOptional: true }],
        }),
        addColumns({
          table: 'packages',
          columns: [{ name: 'discount_amount', type: 'number', isOptional: true }],
        }),
      ],
    },
    {
      /**
       * V15 · a program has weeks, and it has days it trains on.
       *
       * Two nullable columns, and between them they turn a program from one
       * week's shape into something a trainer can actually author.
       *
       * `training_days` is the layout: the weekdays the program runs on, "1,3,5"
       * for Mon/Wed/Fri. It has to exist apart from the blueprint because a
       * program is laid out *before* it is filled — until now the only record of
       * a day was an exercise sitting on it, which meant Tuesday did not exist
       * until something was on Tuesday, and there was no way to put the first
       * thing there.
       *
       * `week` is the progression. It is on the exercise rather than on the
       * program because that is what differs: week 3's Monday is week 1's Monday
       * with heavier numbers, and a per-week row is the only shape that can say
       * so. Null reads as week 1 — every row written before this migration was
       * one week's shape repeated, and back-filling a 1 onto them would claim
       * the trainer authored a week they never opened.
       *
       * The blueprint carries the same `week` inside `templates.structure`,
       * where it needs no migration at all: it is JSON, and `parseBlueprint`
       * already reads an entry missing a field as that field being unset.
       */
      toVersion: 15,
      steps: [
        addColumns({
          table: 'templates',
          columns: [{ name: 'training_days', type: 'string', isOptional: true }],
        }),
        addColumns({
          table: 'program_exercises',
          columns: [{ name: 'week', type: 'number', isOptional: true }],
        }),
      ],
    },
  ],
});
