import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 7,
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
  ],
});
