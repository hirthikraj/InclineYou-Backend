import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 15,
  tables: [
    tableSchema({
      name: 'clients',
      columns: [
        { name: 'trainer_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'phone', type: 'string', isOptional: true },
        { name: 'goal', type: 'string', isOptional: true },
        { name: 'status', type: 'string' },
        { name: 'payment_mode', type: 'string' },
        { name: 'trainer_split_percent', type: 'number', isOptional: true },
        { name: 'height_cm', type: 'number', isOptional: true },
        { name: 'activity_level', type: 'string', isOptional: true },
        { name: 'metadata', type: 'string', isOptional: true },
        // V2 — per-client scheduling config
        { name: 'sessions_per_week', type: 'number', isOptional: true },
        { name: 'session_duration_minutes', type: 'number', isOptional: true },
        { name: 'weekly_schedule', type: 'string', isOptional: true }, // JSON [{day,time}]
        // V5 — how this client is usually trained. Null means never said.
        { name: 'delivery_mode', type: 'string', isOptional: true },
        // V13 — the CLIENT's own consent, as opposed to `status`, which is the
        // trainer's view. Server-owned: the app reads it and never writes it.
        { name: 'membership_status', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'body_metrics',
      columns: [
        { name: 'client_id', type: 'string', isIndexed: true },
        { name: 'metric_type', type: 'string' },
        { name: 'value', type: 'number' },
        { name: 'unit', type: 'string' },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'recorded_at', type: 'number' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'exercises',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'muscle_group', type: 'string', isOptional: true },
        { name: 'equipment', type: 'string', isOptional: true },
        { name: 'movement_pattern', type: 'string', isOptional: true },
        { name: 'description', type: 'string', isOptional: true },
        { name: 'image_url', type: 'string', isOptional: true },
        { name: 'video_url', type: 'string', isOptional: true },
        { name: 'is_custom', type: 'boolean' },
        { name: 'trainer_id', type: 'string', isOptional: true },
        { name: 'source_id', type: 'string', isOptional: true },
        // V8 — 'weight_reps' | 'reps'. Set once, then immutable: every set
        // already logged against the exercise would stop making sense. Null on
        // the whole shared library, and read as 'weight_reps'.
        { name: 'log_type', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'templates',
      columns: [
        { name: 'trainer_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'goal', type: 'string', isOptional: true },
        { name: 'description', type: 'string', isOptional: true },
        // V3 — day labels JSON map {"1":"Push Day","3":"Pull Day"}
        { name: 'day_labels', type: 'string', isOptional: true },
        // V8 — how long the program runs. Null reads as one week: a template
        // with no stated length is a single week's shape repeated.
        { name: 'weeks', type: 'number', isOptional: true },
        // V9, not V8 — see the note on `toVersion: 9` in migrations.ts.
        // The blueprint, as the JSON the server already stores in
        // `template.structure`. Held on the phone so the Programs screen can
        // draw a template's shape and list its days with no signal; the server
        // is still the only place that turns it into a client's program, because
        // assigning COPIES it and a copy is a transaction.
        { name: 'structure', type: 'string', isOptional: true },
        // V15 — the weekdays this program trains on, "1,3,5" for Mon/Wed/Fri.
        // The blueprint knows the day of every exercise on it, but a program is
        // laid out before it is filled: the day exists as soon as the trainer
        // says it does. Null reads as "not told" and the days fall back to
        // whichever ones the blueprint uses.
        { name: 'training_days', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'programs',
      columns: [
        { name: 'trainer_id', type: 'string', isIndexed: true },
        { name: 'client_id', type: 'string', isIndexed: true },
        { name: 'template_id', type: 'string', isOptional: true },
        { name: 'name', type: 'string' },
        { name: 'goal', type: 'string', isOptional: true },
        { name: 'start_date', type: 'string', isOptional: true },
        { name: 'end_date', type: 'string', isOptional: true },
        { name: 'status', type: 'string' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'program_exercises',
      columns: [
        { name: 'program_id', type: 'string', isIndexed: true },
        { name: 'exercise_id', type: 'string', isIndexed: true },
        { name: 'sets', type: 'number', isOptional: true },
        { name: 'reps', type: 'number', isOptional: true },
        { name: 'rest_seconds', type: 'number', isOptional: true },
        { name: 'target_load', type: 'number', isOptional: true },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'day_of_week', type: 'number', isOptional: true },
        // V15 — which week of the program. Null reads as week 1, which is what
        // every row written before multi-week programs existed meant.
        { name: 'week', type: 'number', isOptional: true },
        { name: 'order_index', type: 'number' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'scheduled_sessions',
      columns: [
        { name: 'trainer_id', type: 'string', isIndexed: true },
        { name: 'client_id', type: 'string', isIndexed: true },
        { name: 'program_id', type: 'string', isOptional: true },
        { name: 'scheduled_at', type: 'number' },
        { name: 'duration_minutes', type: 'number', isOptional: true },
        { name: 'status', type: 'string' },
        { name: 'notes', type: 'string', isOptional: true },
        // V3 — denormalized day label from template (e.g. "Push Day")
        { name: 'day_label', type: 'string', isOptional: true },
        // V4 — template day number (1, 2, 3…) to resolve program exercises for workout log
        { name: 'template_day', type: 'number', isOptional: true },
        // V5 — per-session override of the client's usual mode. Null = inherit.
        { name: 'delivery_mode', type: 'string', isOptional: true },
        // V10 — recurrence. Occurrences are real rows sharing a series id.
        { name: 'series_id', type: 'string', isOptional: true },
        // V10 — 'client' | 'trainer'. Who called it off, not a fifth status.
        { name: 'cancelled_by', type: 'string', isOptional: true },
        // V10 — what this session did to a pack, so the 24h undo is exact.
        { name: 'pack_delta', type: 'number', isOptional: true },
        { name: 'pack_package_id', type: 'string', isOptional: true },
        { name: 'pack_applied_at', type: 'number', isOptional: true },
        // V14 — the move, from the client's side. What the time WAS, so the
        // client's notice can strike it through: a client shown only the new
        // time cannot tell what changed and will ask.
        { name: 'moved_from_at', type: 'number', isOptional: true },
        // V14 — the client's one-tap confirm. Not a fifth status: a confirmed
        // session is still `scheduled`.
        { name: 'client_confirmed_at', type: 'number', isOptional: true },
        /**
         * V15 — the batch this session belongs to, if any.
         *
         * A batch is NOT one session with many clients. Every attendee keeps
         * their own row, sharing this id — which is what lets a pack move per
         * person, one attendee no-show while the rest train, and the 24-hour
         * undo stay exact. Same shape as `series_id`.
         */
        { name: 'batch_id', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'workout_sessions',
      columns: [
        { name: 'trainer_id', type: 'string', isIndexed: true },
        { name: 'client_id', type: 'string', isIndexed: true },
        { name: 'program_id', type: 'string', isOptional: true },
        { name: 'scheduled_session_id', type: 'string', isOptional: true },
        { name: 'logged_by', type: 'string' },
        { name: 'session_date', type: 'string' },
        { name: 'notes', type: 'string', isOptional: true },
        // V13 — when the log was closed. Not the same fact as whether the
        // session counted against a pack, which lives on the scheduled session:
        // the sets happened, and whether it counts is the trainer's separate
        // call. Null means the log is still open.
        { name: 'ended_at', type: 'number', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      // Screen 17 — what is in today's log, in the order it is being done.
      //
      // The plan says what should happen; this says what is happening. Three
      // facts have nowhere else to live: an exercise added before its first set,
      // a planned exercise taken out of today, and the order the cards were
      // dragged into. All three are facts about today and none of them is an
      // edit to the client's program.
      name: 'workout_exercises',
      columns: [
        { name: 'workout_session_id', type: 'string', isIndexed: true },
        { name: 'exercise_id', type: 'string', isIndexed: true },
        { name: 'order_index', type: 'number' },
        // 'planned' | 'unplanned'. Draws one quiet tag and nothing else — an
        // unplanned exercise is a first-class row, counted in volume, and
        // adherence must never read this column.
        { name: 'source', type: 'string' },
        // Set when this row replaced a planned exercise. The bench press was
        // not skipped; it was swapped, and that is the distinction the whole
        // off-plan section exists for.
        { name: 'swapped_from_exercise_id', type: 'string', isOptional: true },
        // Copied from the plan when the log opened, not joined: editing the
        // program next week must not rewrite what was asked for today.
        { name: 'target_sets', type: 'number', isOptional: true },
        { name: 'target_reps', type: 'number', isOptional: true },
        // Rest for this exercise. Null means the plan's value, and none at all
        // if the plan has none either.
        { name: 'rest_seconds', type: 'number', isOptional: true },
        // Taken out of today. Soft, so the toast's Undo has something to put
        // back — and so the record that the trainer decided not to do this
        // survives.
        { name: 'removed_at', type: 'number', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'set_logs',
      columns: [
        { name: 'workout_session_id', type: 'string', isIndexed: true },
        { name: 'exercise_id', type: 'string', isIndexed: true },
        { name: 'set_number', type: 'number' },
        { name: 'load_kg', type: 'number', isOptional: true },
        { name: 'reps', type: 'number', isOptional: true },
        { name: 'rpe', type: 'number', isOptional: true },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'packages',
      columns: [
        { name: 'trainer_id', type: 'string', isIndexed: true },
        { name: 'client_id', type: 'string', isIndexed: true },
        { name: 'type', type: 'string' },
        { name: 'sessions_total', type: 'number', isOptional: true },
        { name: 'sessions_remaining', type: 'number', isOptional: true },
        { name: 'amount', type: 'number' },
        { name: 'currency', type: 'string' },
        { name: 'start_date', type: 'string', isOptional: true },
        { name: 'end_date', type: 'string', isOptional: true },
        { name: 'status', type: 'string' },
        // V7 — money. The price-list entry this was sold from, when the money
        // was due, and what was let go rather than deleted.
        { name: 'pack_id', type: 'string', isOptional: true },
        { name: 'due_date', type: 'string', isOptional: true },
        { name: 'written_off_at', type: 'number', isOptional: true },
        { name: 'written_off_amount', type: 'number', isOptional: true },
        // V14 — what was knocked off the list price when this was sold. `amount`
        // stays what the client actually owes; this only says why it is lower.
        { name: 'discount_amount', type: 'number', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'payments',
      columns: [
        { name: 'trainer_id', type: 'string', isIndexed: true },
        { name: 'client_id', type: 'string', isIndexed: true },
        { name: 'package_id', type: 'string', isOptional: true },
        { name: 'amount', type: 'number' },
        { name: 'currency', type: 'string' },
        { name: 'method', type: 'string' },
        { name: 'collected_by', type: 'string' },
        { name: 'status', type: 'string' },
        { name: 'upi_reference', type: 'string', isOptional: true },
        { name: 'paid_at', type: 'number', isOptional: true },
        // V7 — the cut, frozen at record time, and the locally-issued receipt.
        { name: 'gym_share_amount', type: 'number', isOptional: true },
        { name: 'share_percent', type: 'number', isOptional: true },
        { name: 'receipt_no', type: 'string', isOptional: true },
        { name: 'note', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'nudge_logs',
      columns: [
        { name: 'trainer_id', type: 'string', isIndexed: true },
        { name: 'client_id', type: 'string', isIndexed: true },
        { name: 'channel', type: 'string' },
        { name: 'template_name', type: 'string', isOptional: true },
        { name: 'status', type: 'string' },
        { name: 'sent_at', type: 'number' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    // ── Screen 05 · diary ────────────────────────────────────────────────
    tableSchema({
      // One row per window, not per day: a split shift is two windows, and a
      // single range per day would claim the trainer is free for lunch.
      name: 'working_hours',
      columns: [
        { name: 'trainer_id', type: 'string', isIndexed: true },
        { name: 'weekday', type: 'number', isIndexed: true }, // 0 = Monday
        { name: 'start_minute', type: 'number' },
        { name: 'end_minute', type: 'number' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      // A dated hole. One table covers an afternoon and a fortnight away —
      // the only difference is the length.
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
    // ── Screen 06 · money ────────────────────────────────────────────────
    tableSchema({
      // The price list — what the trainer SELLS. `packages` is one of these
      // sold to one client. Menu and bill are different objects.
      name: 'packs',
      columns: [
        { name: 'trainer_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'type', type: 'string' }, // session_pack | monthly | single
        { name: 'sessions', type: 'number', isOptional: true },
        { name: 'amount', type: 'number' },
        { name: 'currency', type: 'string' },
        { name: 'validity_days', type: 'number', isOptional: true },
        { name: 'status', type: 'string' }, // active | inactive
        // V14 — whose price this is. 'trainer' | 'gym'. Null on every row
        // written before the gym price list existed, and null reads as the
        // trainer's own, which is what those rows were.
        { name: 'owner', type: 'string', isOptional: true },
        { name: 'order_index', type: 'number' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      // Money going out. Not a payment: no client, no package, no receipt.
      name: 'gym_settlements',
      columns: [
        { name: 'trainer_id', type: 'string', isIndexed: true },
        { name: 'period', type: 'string', isIndexed: true }, // 'YYYY-MM'
        { name: 'amount', type: 'number' },
        { name: 'sessions_counted', type: 'number', isOptional: true },
        { name: 'gym_name', type: 'string', isOptional: true },
        { name: 'status', type: 'string' }, // due | settled
        { name: 'due_at', type: 'number', isOptional: true },
        { name: 'settled_at', type: 'number', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    // ── Screens 07–16 · behind the drawer ────────────────────────────────
    tableSchema({
      // If / then. A record and not a preference, because a rule is edited on a
      // gym floor with no signal and has to sync like everything else.
      //
      // The send window (9am–8pm) and the frequency cap (once per client per
      // seven days) are deliberately absent: they are fixed in code. A limit
      // with a text field beside it is not a limit.
      name: 'nudge_rules',
      columns: [
        { name: 'trainer_id', type: 'string', isIndexed: true },
        // 'quiet' | 'pack_low' | 'overdue' | 'well_done' | 'birthday'
        { name: 'kind', type: 'string', isIndexed: true },
        // Days, or sessions left, depending on the kind. Null where the kind has
        // no threshold — a birthday is on the day.
        { name: 'threshold', type: 'number', isOptional: true },
        { name: 'action', type: 'string' }, // ask | auto
        // Null falls back to the built-in wording, so a trainer who never edits
        // a message still gets a sensible one.
        { name: 'message', type: 'string', isOptional: true },
        { name: 'enabled', type: 'boolean' },
        { name: 'order_index', type: 'number' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      // A star. A join table because 861 of the 873 exercises are the shared
      // library — they belong to no trainer, and one trainer's star must not
      // show up in another's list.
      name: 'exercise_favourites',
      columns: [
        { name: 'trainer_id', type: 'string', isIndexed: true },
        { name: 'exercise_id', type: 'string', isIndexed: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      /**
       * FR-11 · the client's trainer, on the client's phone.
       *
       * One row. Not a table on the server — it is the `trainer` record cut down
       * to the four things a client is allowed to know, which is why it has its
       * own name here: `trainers` would imply a directory, and a client can see
       * exactly one.
       *
       * `upi_vpa` is on the phone and is never rendered. The rule is that the
       * client app never SHOWS the trainer's VPA — his profile hides it, the
       * deep link carries it, and his own name comes back from the client's UPI
       * app before they authorise. Holding it locally is what lets the payment
       * screen build that link with no signal.
       */
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
    tableSchema({
      /**
       * A batch — the word an Indian gym floor uses for a group.
       *
       * Holds only what is true of the group rather than of any one attendee:
       * its name, what the floor can hold, and the number below which it isn't
       * worth running. Who is *in* it lives on `scheduled_sessions.batch_id`,
       * one row per person, so a pack still moves per client.
       */
      name: 'batches',
      columns: [
        { name: 'trainer_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        /** What the floor holds. The design's "8/10" is booked over this. */
        { name: 'capacity', type: 'number' },
        /** Below this it isn't worth running, and the row says so in advance. */
        { name: 'min_size', type: 'number' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      /**
       * FR-10.2 · Sunday's report, as it was sent.
       *
       * The only table in this app whose rows are not derived from the others.
       * Everything else is computed on read so that fixing a set from November
       * fixes every number that depended on it; this one is stored because it
       * was sent, and both people read the same figures. Written by the server,
       * pulled down, never written here.
       */
      name: 'weekly_reports',
      columns: [
        { name: 'trainer_id', type: 'string', isIndexed: true },
        { name: 'client_id', type: 'string', isIndexed: true },
        { name: 'week_start', type: 'string' },
        { name: 'week_end', type: 'string' },
        { name: 'sessions_kept', type: 'number' },
        { name: 'sessions_planned', type: 'number' },
        // ISO weekday numbers with a logged set, e.g. "2,7". Seven cells, never
        // queried.
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
  ],
});
