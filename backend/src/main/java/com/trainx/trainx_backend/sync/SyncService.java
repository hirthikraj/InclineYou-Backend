package com.trainx.trainx_backend.sync;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class SyncService {

    private final NamedParameterJdbcTemplate jdbc;

    // ── Response types ────────────────────────────────────────────────────────

    public record PullResponse(long timestamp, Map<String, TableChanges> changes) {}

    public record TableChanges(
            List<Map<String, Object>> created,
            List<Map<String, Object>> updated,
            List<String> deleted
    ) {}

    // ── Pull ──────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public PullResponse pull(UUID trainerId, Long lastPulledAt) {
        Timestamp cursor = (lastPulledAt != null && lastPulledAt > 0)
                ? Timestamp.from(Instant.ofEpochMilli(lastPulledAt))
                : Timestamp.from(Instant.EPOCH);

        String tid = trainerId.toString();
        log.debug("sync pull trainer={} cursor={}", tid, cursor);

        var changes = new LinkedHashMap<String, TableChanges>();
        changes.put("clients",              fetchDirect("client",            "trainer_id", tid, cursor));
        changes.put("body_metrics",         fetchViaClient("body_metric",                  tid, cursor));
        changes.put("exercises",            fetchExercises(                                tid, cursor));
        changes.put("templates",            fetchDirect("template",          "trainer_id", tid, cursor));
        changes.put("programs",             fetchDirect("program",           "trainer_id", tid, cursor));
        changes.put("program_exercises",    fetchViaProgramDirect(                         tid, cursor));
        changes.put("scheduled_sessions",   fetchDirect("scheduled_session", "trainer_id", tid, cursor));
        changes.put("workout_sessions",     fetchDirect("workout_session",   "trainer_id", tid, cursor));
        changes.put("set_logs",             fetchViaWorkout(                               tid, cursor));
        changes.put("packages",             fetchDirect("package",           "trainer_id", tid, cursor));
        changes.put("payments",             fetchDirect("payment",           "trainer_id", tid, cursor));
        changes.put("nudge_logs",           fetchDirect("nudge_log",         "trainer_id", tid, cursor));

        return new PullResponse(Instant.now().toEpochMilli(), changes);
    }

    // trainer_id FK is directly on this table
    private TableChanges fetchDirect(String table, String fkCol, String tid, Timestamp cursor) {
        var params = Map.of("tid", tid, "cursor", cursor);

        String aliveSql = """
                SELECT * FROM %s
                WHERE %s = :tid::uuid
                  AND deleted_at IS NULL
                  AND updated_at > :cursor
                ORDER BY updated_at ASC
                """.formatted(table, fkCol);

        String deadSql = """
                SELECT id::text FROM %s
                WHERE %s = :tid::uuid
                  AND deleted_at IS NOT NULL
                  AND updated_at > :cursor
                """.formatted(table, fkCol);

        return splitAlive(queryNormalized(aliveSql, params), cursor, queryIds(deadSql, params));
    }

    // body_metric → client.trainer_id
    private TableChanges fetchViaClient(String table, String tid, Timestamp cursor) {
        var params = Map.of("tid", tid, "cursor", cursor);

        String aliveSql = """
                SELECT bm.* FROM %s bm
                JOIN client c ON c.id = bm.client_id
                WHERE c.trainer_id = :tid::uuid
                  AND bm.deleted_at IS NULL
                  AND bm.updated_at > :cursor
                ORDER BY bm.updated_at ASC
                """.formatted(table);

        String deadSql = """
                SELECT bm.id::text FROM %s bm
                JOIN client c ON c.id = bm.client_id
                WHERE c.trainer_id = :tid::uuid
                  AND bm.deleted_at IS NOT NULL
                  AND bm.updated_at > :cursor
                """.formatted(table);

        return splitAlive(queryNormalized(aliveSql, params), cursor, queryIds(deadSql, params));
    }

    // exercises: global (is_custom=false) OR trainer's own custom
    private TableChanges fetchExercises(String tid, Timestamp cursor) {
        var params = Map.of("tid", tid, "cursor", cursor);

        String aliveSql = """
                SELECT * FROM exercise
                WHERE (is_custom = false OR trainer_id = :tid::uuid)
                  AND deleted_at IS NULL
                  AND updated_at > :cursor
                ORDER BY updated_at ASC
                """;

        String deadSql = """
                SELECT id::text FROM exercise
                WHERE (is_custom = false OR trainer_id = :tid::uuid)
                  AND deleted_at IS NOT NULL
                  AND updated_at > :cursor
                """;

        return splitAlive(queryNormalized(aliveSql, params), cursor, queryIds(deadSql, params));
    }

    // program_exercise → program.trainer_id
    private TableChanges fetchViaProgramDirect(String tid, Timestamp cursor) {
        var params = Map.of("tid", tid, "cursor", cursor);

        String aliveSql = """
                SELECT pe.* FROM program_exercise pe
                JOIN program p ON p.id = pe.program_id
                WHERE p.trainer_id = :tid::uuid
                  AND pe.deleted_at IS NULL
                  AND pe.updated_at > :cursor
                ORDER BY pe.updated_at ASC
                """;

        String deadSql = """
                SELECT pe.id::text FROM program_exercise pe
                JOIN program p ON p.id = pe.program_id
                WHERE p.trainer_id = :tid::uuid
                  AND pe.deleted_at IS NOT NULL
                  AND pe.updated_at > :cursor
                """;

        return splitAlive(queryNormalized(aliveSql, params), cursor, queryIds(deadSql, params));
    }

    // set_log → workout_session.trainer_id
    private TableChanges fetchViaWorkout(String tid, Timestamp cursor) {
        var params = Map.of("tid", tid, "cursor", cursor);

        String aliveSql = """
                SELECT sl.* FROM set_log sl
                JOIN workout_session ws ON ws.id = sl.workout_session_id
                WHERE ws.trainer_id = :tid::uuid
                  AND sl.deleted_at IS NULL
                  AND sl.updated_at > :cursor
                ORDER BY sl.updated_at ASC
                """;

        String deadSql = """
                SELECT sl.id::text FROM set_log sl
                JOIN workout_session ws ON ws.id = sl.workout_session_id
                WHERE ws.trainer_id = :tid::uuid
                  AND sl.deleted_at IS NOT NULL
                  AND sl.updated_at > :cursor
                """;

        return splitAlive(queryNormalized(aliveSql, params), cursor, queryIds(deadSql, params));
    }

    /**
     * Split normalized alive rows into created vs updated based on whether
     * the record's created_at is after the cursor.  WatermelonDB requires this
     * distinction: sending an existing record in `created` triggers a warning
     * and can cause data inconsistency on the client.
     */
    private static TableChanges splitAlive(
            List<Map<String, Object>> rows, Timestamp cursor, List<String> deleted) {
        long cursorMs = cursor.toInstant().toEpochMilli();
        var created = new ArrayList<Map<String, Object>>();
        var updated = new ArrayList<Map<String, Object>>();
        for (var row : rows) {
            Object ca = row.get("created_at");
            long createdMs = ca instanceof Number n ? n.longValue() : 0L;
            (createdMs > cursorMs ? created : updated).add(row);
        }
        return new TableChanges(created, updated, deleted);
    }

    // ── Push ──────────────────────────────────────────────────────────────────

    @Transactional
    public void push(UUID trainerId, Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        var changes = (Map<String, Object>) body.get("changes");
        if (changes == null) return;

        String tid = trainerId.toString();
        pushClients(tid, changes);
        pushBodyMetrics(tid, changes);
        pushTemplates(tid, changes);
        pushPrograms(tid, changes);
        pushProgramExercises(tid, changes);
        pushScheduledSessions(tid, changes);
        pushWorkoutSessions(tid, changes);
        pushSetLogs(tid, changes);
        pushPackages(tid, changes);
        pushPayments(tid, changes);
        pushNudgeLogs(tid, changes);
        warnOnUnhandledTables(tid, changes);
        log.debug("sync push trainer={} tables={}", tid, changes.keySet());
    }

    private static final Set<String> HANDLED_PUSH_TABLES = Set.of(
            "clients", "body_metrics", "templates", "programs", "program_exercises",
            "scheduled_sessions", "workout_sessions", "set_logs",
            "packages", "payments", "nudge_logs");

    @SuppressWarnings("unchecked")
    private void warnOnUnhandledTables(String tid, Map<String, Object> changes) {
        for (var entry : changes.entrySet()) {
            if (HANDLED_PUSH_TABLES.contains(entry.getKey())) continue;
            if (!(entry.getValue() instanceof Map<?, ?> table)) continue;

            int count = mergeCreatedUpdated((Map<String, Object>) table).size()
                    + deletedIds((Map<String, Object>) table).size();
            if (count > 0) {
                log.warn("sync push trainer={}: DROPPED {} record(s) for unimplemented table '{}'",
                        tid, count, entry.getKey());
            }
        }
    }

    @SuppressWarnings("unchecked")
    private void pushClients(String tid, Map<String, Object> changes) {
        var table = (Map<String, Object>) changes.get("clients");
        if (table == null) return;

        for (var record : mergeCreatedUpdated(table)) {
            var p = new HashMap<String, Object>();
            p.put("id",                    str(record.get("id")));
            p.put("tid",                   tid);
            p.put("name",                  str(record.get("name")));
            p.put("phone",                 record.get("phone"));
            p.put("goal",                  record.get("goal"));
            p.put("status",                strOrDefault(record.get("status"), "active"));
            p.put("payment_mode",          strOrDefault(record.get("payment_mode"), "trainer_collects"));
            p.put("trainer_split_percent", record.get("trainer_split_percent"));
            p.put("height_cm",             record.get("height_cm"));
            p.put("activity_level",        record.get("activity_level"));
            p.put("metadata",                 toJsonString(record.get("metadata")));
            p.put("sessions_per_week",        record.get("sessions_per_week"));
            p.put("session_duration_minutes", record.get("session_duration_minutes"));
            p.put("weekly_schedule",          toJsonString(record.get("weekly_schedule")));
            p.put("delivery_mode",            deliveryMode(record.get("delivery_mode")));
            p.put("created_at",               toTimestamp(record.get("created_at")));
            p.put("updated_at",               toTimestamp(record.get("updated_at")));

            jdbc.update("""
                    INSERT INTO client (id, trainer_id, name, phone, goal, status, payment_mode,
                        trainer_split_percent, height_cm, activity_level, metadata,
                        sessions_per_week, session_duration_minutes, weekly_schedule,
                        delivery_mode, created_at, updated_at)
                    VALUES (:id::uuid, :tid::uuid, :name, :phone, :goal, :status, :payment_mode,
                        :trainer_split_percent, :height_cm, :activity_level,
                        CAST(:metadata AS jsonb),
                        :sessions_per_week, :session_duration_minutes,
                        CAST(:weekly_schedule AS jsonb),
                        :delivery_mode,
                        COALESCE(:created_at, NOW()), COALESCE(:updated_at, NOW()))
                    ON CONFLICT (id) DO UPDATE SET
                        name                    = EXCLUDED.name,
                        phone                   = EXCLUDED.phone,
                        goal                    = EXCLUDED.goal,
                        status                  = EXCLUDED.status,
                        payment_mode            = EXCLUDED.payment_mode,
                        trainer_split_percent   = EXCLUDED.trainer_split_percent,
                        height_cm               = EXCLUDED.height_cm,
                        activity_level          = EXCLUDED.activity_level,
                        metadata                = EXCLUDED.metadata,
                        sessions_per_week       = EXCLUDED.sessions_per_week,
                        session_duration_minutes= EXCLUDED.session_duration_minutes,
                        weekly_schedule         = EXCLUDED.weekly_schedule,
                        delivery_mode           = EXCLUDED.delivery_mode,
                        updated_at              = EXCLUDED.updated_at
                    WHERE client.trainer_id = :tid::uuid
                    """, p);
        }

        for (String id : deletedIds(table)) {
            jdbc.update("""
                    UPDATE client SET deleted_at = NOW(), updated_at = NOW()
                    WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                    """, Map.of("id", id, "tid", tid));
        }
    }

    @SuppressWarnings("unchecked")
    private void pushBodyMetrics(String tid, Map<String, Object> changes) {
        var table = (Map<String, Object>) changes.get("body_metrics");
        if (table == null) return;

        for (var record : mergeCreatedUpdated(table)) {
            String clientId = str(record.get("client_id"));
            if (clientId == null) continue;

            // Validate client ownership before upsert
            Boolean owned = jdbc.queryForObject(
                    "SELECT EXISTS(SELECT 1 FROM client WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)",
                    Map.of("cid", clientId, "tid", tid), Boolean.class);
            if (!Boolean.TRUE.equals(owned)) {
                log.warn("push body_metric: client {} not owned by trainer {}, skipping", clientId, tid);
                continue;
            }

            var p = new HashMap<String, Object>();
            p.put("id",          str(record.get("id")));
            p.put("client_id",   clientId);
            p.put("metric_type", str(record.get("metric_type")));
            p.put("value",       record.get("value"));
            p.put("unit",        str(record.get("unit")));
            p.put("notes",       record.get("notes"));
            p.put("recorded_at", toTimestamp(record.get("recorded_at")));
            p.put("created_at",  toTimestamp(record.get("created_at")));
            p.put("updated_at",  toTimestamp(record.get("updated_at")));

            jdbc.update("""
                    INSERT INTO body_metric (id, client_id, metric_type, value, unit, notes, recorded_at, created_at, updated_at)
                    VALUES (:id::uuid, :client_id::uuid, :metric_type, :value, :unit, :notes,
                        :recorded_at, COALESCE(:created_at, NOW()), COALESCE(:updated_at, NOW()))
                    ON CONFLICT (id) DO UPDATE SET
                        metric_type = EXCLUDED.metric_type,
                        value       = EXCLUDED.value,
                        unit        = EXCLUDED.unit,
                        notes       = EXCLUDED.notes,
                        recorded_at = EXCLUDED.recorded_at,
                        updated_at  = EXCLUDED.updated_at
                    """, p);
        }

        for (String id : deletedIds(table)) {
            jdbc.update("""
                    UPDATE body_metric bm SET deleted_at = NOW(), updated_at = NOW()
                    FROM client c
                    WHERE bm.id = :id::uuid AND bm.client_id = c.id
                      AND c.trainer_id = :tid::uuid AND bm.deleted_at IS NULL
                    """, Map.of("id", id, "tid", tid));
        }
    }

    @SuppressWarnings("unchecked")
    private void pushTemplates(String tid, Map<String, Object> changes) {
        var table = (Map<String, Object>) changes.get("templates");
        if (table == null) return;

        for (var record : mergeCreatedUpdated(table)) {
            var p = new HashMap<String, Object>();
            p.put("id",          str(record.get("id")));
            p.put("tid",         tid);
            p.put("name",        str(record.get("name")));
            p.put("goal",        record.get("goal"));
            p.put("description", record.get("description"));
            p.put("structure",   toJsonString(record.get("structure")));
            p.put("day_labels",  toJsonString(record.get("day_labels")));
            p.put("created_at",  toTimestamp(record.get("created_at")));
            p.put("updated_at",  toTimestamp(record.get("updated_at")));

            jdbc.update("""
                    INSERT INTO template (id, trainer_id, name, goal, description, structure, day_labels, created_at, updated_at)
                    VALUES (:id::uuid, :tid::uuid, :name, :goal, :description,
                        CAST(:structure AS jsonb), CAST(:day_labels AS jsonb),
                        COALESCE(:created_at, NOW()), COALESCE(:updated_at, NOW()))
                    ON CONFLICT (id) DO UPDATE SET
                        name        = EXCLUDED.name,
                        goal        = EXCLUDED.goal,
                        description = EXCLUDED.description,
                        structure   = EXCLUDED.structure,
                        day_labels  = EXCLUDED.day_labels,
                        updated_at  = EXCLUDED.updated_at
                    WHERE template.trainer_id = :tid::uuid
                    """, p);
        }

        for (String id : deletedIds(table)) {
            jdbc.update("""
                    UPDATE template SET deleted_at = NOW(), updated_at = NOW()
                    WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                    """, Map.of("id", id, "tid", tid));
        }
    }

    @SuppressWarnings("unchecked")
    private void pushPrograms(String tid, Map<String, Object> changes) {
        var table = (Map<String, Object>) changes.get("programs");
        if (table == null) return;

        for (var record : mergeCreatedUpdated(table)) {
            String clientId = str(record.get("client_id"));
            if (clientId == null) continue;

            Boolean owned = jdbc.queryForObject(
                    "SELECT EXISTS(SELECT 1 FROM client WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)",
                    Map.of("cid", clientId, "tid", tid), Boolean.class);
            if (!Boolean.TRUE.equals(owned)) {
                log.warn("sync push trainer={}: skipping program — client {} not owned", tid, clientId);
                continue;
            }

            var p = new HashMap<String, Object>();
            p.put("id",         str(record.get("id")));
            p.put("tid",        tid);
            p.put("cid",        clientId);
            p.put("templateId", record.get("template_id"));
            p.put("name",       str(record.get("name")));
            p.put("goal",       record.get("goal"));
            p.put("startDate",  toSqlDate(record.get("start_date")));
            p.put("endDate",    toSqlDate(record.get("end_date")));
            p.put("status",     strOrDefault(record.get("status"), "active"));
            p.put("created_at", toTimestamp(record.get("created_at")));
            p.put("updated_at", toTimestamp(record.get("updated_at")));

            jdbc.update("""
                    INSERT INTO program (id, trainer_id, client_id, template_id, name, goal,
                        start_date, end_date, status, created_at, updated_at)
                    VALUES (:id::uuid, :tid::uuid, :cid::uuid, :templateId::uuid, :name, :goal,
                        :startDate, :endDate, :status,
                        COALESCE(:created_at, NOW()), COALESCE(:updated_at, NOW()))
                    ON CONFLICT (id) DO UPDATE SET
                        name       = EXCLUDED.name,
                        goal       = EXCLUDED.goal,
                        start_date = EXCLUDED.start_date,
                        end_date   = EXCLUDED.end_date,
                        status     = EXCLUDED.status,
                        updated_at = EXCLUDED.updated_at
                    WHERE program.trainer_id = :tid::uuid
                    """, p);
        }

        for (String id : deletedIds(table)) {
            jdbc.update("""
                    UPDATE program SET deleted_at = NOW(), updated_at = NOW()
                    WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                    """, Map.of("id", id, "tid", tid));
        }
    }

    @SuppressWarnings("unchecked")
    private void pushProgramExercises(String tid, Map<String, Object> changes) {
        var table = (Map<String, Object>) changes.get("program_exercises");
        if (table == null) return;

        for (var record : mergeCreatedUpdated(table)) {
            String programId = str(record.get("program_id"));
            if (programId == null) continue;

            Boolean owned = jdbc.queryForObject(
                    "SELECT EXISTS(SELECT 1 FROM program WHERE id = :pid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)",
                    Map.of("pid", programId, "tid", tid), Boolean.class);
            if (!Boolean.TRUE.equals(owned)) {
                log.warn("sync push trainer={}: skipping program_exercise — program {} not owned", tid, programId);
                continue;
            }

            var p = new HashMap<String, Object>();
            p.put("id",          str(record.get("id")));
            p.put("programId",   programId);
            p.put("exerciseId",  str(record.get("exercise_id")));
            p.put("sets",        record.get("sets"));
            p.put("reps",        record.get("reps"));
            p.put("restSeconds", record.get("rest_seconds"));
            p.put("targetLoad",  record.get("target_load"));
            p.put("notes",       record.get("notes"));
            p.put("dayOfWeek",   record.get("day_of_week"));
            p.put("orderIndex",  record.getOrDefault("order_index", 0));
            p.put("created_at",  toTimestamp(record.get("created_at")));
            p.put("updated_at",  toTimestamp(record.get("updated_at")));

            jdbc.update("""
                    INSERT INTO program_exercise (id, program_id, exercise_id, sets, reps,
                        rest_seconds, target_load, notes, day_of_week, order_index, created_at, updated_at)
                    VALUES (:id::uuid, :programId::uuid, :exerciseId::uuid, :sets, :reps,
                        :restSeconds, :targetLoad, :notes, :dayOfWeek, :orderIndex,
                        COALESCE(:created_at, NOW()), COALESCE(:updated_at, NOW()))
                    ON CONFLICT (id) DO UPDATE SET
                        sets         = EXCLUDED.sets,
                        reps         = EXCLUDED.reps,
                        rest_seconds = EXCLUDED.rest_seconds,
                        target_load  = EXCLUDED.target_load,
                        notes        = EXCLUDED.notes,
                        day_of_week  = EXCLUDED.day_of_week,
                        order_index  = EXCLUDED.order_index,
                        updated_at   = EXCLUDED.updated_at
                    """, p);
        }

        for (String id : deletedIds(table)) {
            jdbc.update("""
                    UPDATE program_exercise pe SET deleted_at = NOW(), updated_at = NOW()
                    FROM program p
                    WHERE pe.id = :id::uuid AND pe.program_id = p.id
                      AND p.trainer_id = :tid::uuid AND pe.deleted_at IS NULL
                    """, Map.of("id", id, "tid", tid));
        }
    }

    @SuppressWarnings("unchecked")
    private void pushScheduledSessions(String tid, Map<String, Object> changes) {
        var table = (Map<String, Object>) changes.get("scheduled_sessions");
        if (table == null) return;

        for (var record : mergeCreatedUpdated(table)) {
            String clientId = str(record.get("client_id"));
            if (clientId == null) continue;

            Boolean owned = jdbc.queryForObject(
                    "SELECT EXISTS(SELECT 1 FROM client WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)",
                    Map.of("cid", clientId, "tid", tid), Boolean.class);
            if (!Boolean.TRUE.equals(owned)) {
                log.warn("sync push trainer={}: skipping scheduled_session — client {} not owned", tid, clientId);
                continue;
            }

            var p = new HashMap<String, Object>();
            p.put("id",              str(record.get("id")));
            p.put("tid",             tid);
            p.put("cid",             clientId);
            p.put("programId",       record.get("program_id"));
            p.put("scheduledAt",     toTimestamp(record.get("scheduled_at")));
            p.put("durationMinutes", record.get("duration_minutes"));
            p.put("status",          strOrDefault(record.get("status"), "scheduled"));
            p.put("notes",           record.get("notes"));
            p.put("dayLabel",        record.get("day_label"));
            p.put("templateDay",     record.get("template_day"));
            p.put("deliveryMode",    deliveryMode(record.get("delivery_mode")));
            p.put("created_at",      toTimestamp(record.get("created_at")));
            p.put("updated_at",      toTimestamp(record.get("updated_at")));

            jdbc.update("""
                    INSERT INTO scheduled_session (id, trainer_id, client_id, program_id,
                        scheduled_at, duration_minutes, status, notes, day_label, template_day,
                        delivery_mode, created_at, updated_at)
                    VALUES (:id::uuid, :tid::uuid, :cid::uuid, :programId::uuid,
                        :scheduledAt, :durationMinutes, :status, :notes, :dayLabel, :templateDay,
                        :deliveryMode,
                        COALESCE(:created_at, NOW()), COALESCE(:updated_at, NOW()))
                    ON CONFLICT (id) DO UPDATE SET
                        scheduled_at     = EXCLUDED.scheduled_at,
                        duration_minutes = EXCLUDED.duration_minutes,
                        status           = EXCLUDED.status,
                        notes            = EXCLUDED.notes,
                        day_label        = EXCLUDED.day_label,
                        template_day     = EXCLUDED.template_day,
                        delivery_mode    = EXCLUDED.delivery_mode,
                        updated_at       = EXCLUDED.updated_at
                    WHERE scheduled_session.trainer_id = :tid::uuid
                    """, p);
        }

        for (String id : deletedIds(table)) {
            jdbc.update("""
                    UPDATE scheduled_session SET deleted_at = NOW(), updated_at = NOW()
                    WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                    """, Map.of("id", id, "tid", tid));
        }
    }

    @SuppressWarnings("unchecked")
    private void pushWorkoutSessions(String tid, Map<String, Object> changes) {
        var table = (Map<String, Object>) changes.get("workout_sessions");
        if (table == null) return;

        for (var record : mergeCreatedUpdated(table)) {
            String clientId = str(record.get("client_id"));
            if (clientId == null) continue;

            Boolean owned = jdbc.queryForObject(
                    "SELECT EXISTS(SELECT 1 FROM client WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)",
                    Map.of("cid", clientId, "tid", tid), Boolean.class);
            if (!Boolean.TRUE.equals(owned)) {
                log.warn("sync push trainer={}: skipping workout_session — client {} not owned", tid, clientId);
                continue;
            }

            var p = new HashMap<String, Object>();
            p.put("id",                 str(record.get("id")));
            p.put("tid",                tid);
            p.put("cid",                clientId);
            p.put("programId",          record.get("program_id"));
            p.put("scheduledSessionId", record.get("scheduled_session_id"));
            p.put("loggedBy",           strOrDefault(record.get("logged_by"), "trainer"));
            p.put("sessionDate",        toSqlDate(record.get("session_date")));
            p.put("notes",              record.get("notes"));
            p.put("created_at",         toTimestamp(record.get("created_at")));
            p.put("updated_at",         toTimestamp(record.get("updated_at")));

            jdbc.update("""
                    INSERT INTO workout_session (id, trainer_id, client_id, program_id,
                        scheduled_session_id, logged_by, session_date, notes, created_at, updated_at)
                    VALUES (:id::uuid, :tid::uuid, :cid::uuid, :programId::uuid,
                        :scheduledSessionId::uuid, :loggedBy, :sessionDate, :notes,
                        COALESCE(:created_at, NOW()), COALESCE(:updated_at, NOW()))
                    ON CONFLICT (id) DO UPDATE SET
                        session_date = EXCLUDED.session_date,
                        notes        = EXCLUDED.notes,
                        updated_at   = EXCLUDED.updated_at
                    WHERE workout_session.trainer_id = :tid::uuid
                    """, p);
        }

        for (String id : deletedIds(table)) {
            jdbc.update("""
                    UPDATE workout_session SET deleted_at = NOW(), updated_at = NOW()
                    WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                    """, Map.of("id", id, "tid", tid));
        }
    }

    @SuppressWarnings("unchecked")
    private void pushSetLogs(String tid, Map<String, Object> changes) {
        var table = (Map<String, Object>) changes.get("set_logs");
        if (table == null) return;

        for (var record : mergeCreatedUpdated(table)) {
            String workoutId = str(record.get("workout_session_id"));
            if (workoutId == null) continue;

            Boolean owned = jdbc.queryForObject(
                    "SELECT EXISTS(SELECT 1 FROM workout_session WHERE id = :wid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)",
                    Map.of("wid", workoutId, "tid", tid), Boolean.class);
            if (!Boolean.TRUE.equals(owned)) {
                log.warn("sync push trainer={}: skipping set_log — workout_session {} not owned", tid, workoutId);
                continue;
            }

            var p = new HashMap<String, Object>();
            p.put("id",        str(record.get("id")));
            p.put("workoutId", workoutId);
            p.put("exerciseId", str(record.get("exercise_id")));
            p.put("setNumber", record.get("set_number"));
            p.put("loadKg",    record.get("load_kg"));
            p.put("reps",      record.get("reps"));
            p.put("rpe",       record.get("rpe"));
            p.put("notes",     record.get("notes"));
            p.put("created_at", toTimestamp(record.get("created_at")));
            p.put("updated_at", toTimestamp(record.get("updated_at")));

            jdbc.update("""
                    INSERT INTO set_log (id, workout_session_id, exercise_id, set_number,
                        load_kg, reps, rpe, notes, created_at, updated_at)
                    VALUES (:id::uuid, :workoutId::uuid, :exerciseId::uuid, :setNumber,
                        :loadKg, :reps, :rpe, :notes,
                        COALESCE(:created_at, NOW()), COALESCE(:updated_at, NOW()))
                    ON CONFLICT (id) DO UPDATE SET
                        load_kg    = EXCLUDED.load_kg,
                        reps       = EXCLUDED.reps,
                        rpe        = EXCLUDED.rpe,
                        notes      = EXCLUDED.notes,
                        updated_at = EXCLUDED.updated_at
                    """, p);
        }

        for (String id : deletedIds(table)) {
            jdbc.update("""
                    UPDATE set_log sl SET deleted_at = NOW(), updated_at = NOW()
                    FROM workout_session ws
                    WHERE sl.id = :id::uuid AND sl.workout_session_id = ws.id
                      AND ws.trainer_id = :tid::uuid AND sl.deleted_at IS NULL
                    """, Map.of("id", id, "tid", tid));
        }
    }

    @SuppressWarnings("unchecked")
    private void pushPackages(String tid, Map<String, Object> changes) {
        var table = (Map<String, Object>) changes.get("packages");
        if (table == null) return;

        for (var record : mergeCreatedUpdated(table)) {
            String clientId = str(record.get("client_id"));
            if (clientId == null) continue;

            Boolean owned = jdbc.queryForObject(
                    "SELECT EXISTS(SELECT 1 FROM client WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)",
                    Map.of("cid", clientId, "tid", tid), Boolean.class);
            if (!Boolean.TRUE.equals(owned)) {
                log.warn("sync push trainer={}: skipping package — client {} not owned", tid, clientId);
                continue;
            }

            var p = new HashMap<String, Object>();
            p.put("id",                 str(record.get("id")));
            p.put("tid",                tid);
            p.put("cid",                clientId);
            p.put("type",               strOrDefault(record.get("type"), "session_pack"));
            p.put("sessionsTotal",      record.get("sessions_total"));
            p.put("sessionsRemaining",  record.get("sessions_remaining"));
            p.put("amount",             record.get("amount"));
            p.put("currency",           strOrDefault(record.get("currency"), "INR"));
            p.put("startDate",          toSqlDate(record.get("start_date")));
            p.put("endDate",            toSqlDate(record.get("end_date")));
            p.put("status",             strOrDefault(record.get("status"), "active"));
            p.put("created_at",         toTimestamp(record.get("created_at")));
            p.put("updated_at",         toTimestamp(record.get("updated_at")));

            jdbc.update("""
                    INSERT INTO package (id, trainer_id, client_id, type, sessions_total, sessions_remaining,
                        amount, currency, start_date, end_date, status, created_at, updated_at)
                    VALUES (:id::uuid, :tid::uuid, :cid::uuid, :type, :sessionsTotal, :sessionsRemaining,
                        :amount, :currency, :startDate, :endDate, :status,
                        COALESCE(:created_at, NOW()), COALESCE(:updated_at, NOW()))
                    ON CONFLICT (id) DO UPDATE SET
                        type                = EXCLUDED.type,
                        sessions_total      = EXCLUDED.sessions_total,
                        sessions_remaining  = EXCLUDED.sessions_remaining,
                        amount              = EXCLUDED.amount,
                        currency            = EXCLUDED.currency,
                        start_date          = EXCLUDED.start_date,
                        end_date            = EXCLUDED.end_date,
                        status              = EXCLUDED.status,
                        updated_at          = EXCLUDED.updated_at
                    WHERE package.trainer_id = :tid::uuid
                    """, p);
        }

        for (String id : deletedIds(table)) {
            jdbc.update("""
                    UPDATE package SET deleted_at = NOW(), updated_at = NOW()
                    WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                    """, Map.of("id", id, "tid", tid));
        }
    }

    @SuppressWarnings("unchecked")
    private void pushPayments(String tid, Map<String, Object> changes) {
        var table = (Map<String, Object>) changes.get("payments");
        if (table == null) return;

        for (var record : mergeCreatedUpdated(table)) {
            String clientId = str(record.get("client_id"));
            if (clientId == null) continue;

            Boolean owned = jdbc.queryForObject(
                    "SELECT EXISTS(SELECT 1 FROM client WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)",
                    Map.of("cid", clientId, "tid", tid), Boolean.class);
            if (!Boolean.TRUE.equals(owned)) {
                log.warn("sync push trainer={}: skipping payment — client {} not owned", tid, clientId);
                continue;
            }

            var p = new HashMap<String, Object>();
            p.put("id",           str(record.get("id")));
            p.put("tid",          tid);
            p.put("cid",          clientId);
            p.put("packageId",    record.get("package_id"));
            p.put("amount",       record.get("amount"));
            p.put("currency",     strOrDefault(record.get("currency"), "INR"));
            p.put("method",       strOrDefault(record.get("method"), "upi_intent"));
            p.put("collectedBy",  strOrDefault(record.get("collected_by"), "trainer"));
            p.put("status",       strOrDefault(record.get("status"), "pending"));
            p.put("upiReference", record.get("upi_reference"));
            p.put("paidAt",       toTimestamp(record.get("paid_at")));
            p.put("created_at",   toTimestamp(record.get("created_at")));
            p.put("updated_at",   toTimestamp(record.get("updated_at")));

            jdbc.update("""
                    INSERT INTO payment (id, trainer_id, client_id, package_id, amount, currency,
                        method, collected_by, status, upi_reference, paid_at, created_at, updated_at)
                    VALUES (:id::uuid, :tid::uuid, :cid::uuid, :packageId::uuid, :amount, :currency,
                        :method, :collectedBy, :status, :upiReference, :paidAt,
                        COALESCE(:created_at, NOW()), COALESCE(:updated_at, NOW()))
                    ON CONFLICT (id) DO UPDATE SET
                        status        = EXCLUDED.status,
                        upi_reference = EXCLUDED.upi_reference,
                        paid_at       = EXCLUDED.paid_at,
                        updated_at    = EXCLUDED.updated_at
                    WHERE payment.trainer_id = :tid::uuid
                    """, p);
        }

        for (String id : deletedIds(table)) {
            jdbc.update("""
                    UPDATE payment SET deleted_at = NOW(), updated_at = NOW()
                    WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                    """, Map.of("id", id, "tid", tid));
        }
    }

    @SuppressWarnings("unchecked")
    private void pushNudgeLogs(String tid, Map<String, Object> changes) {
        var table = (Map<String, Object>) changes.get("nudge_logs");
        if (table == null) return;

        for (var record : mergeCreatedUpdated(table)) {
            String clientId = str(record.get("client_id"));
            if (clientId == null) continue;

            var p = new HashMap<String, Object>();
            p.put("id",           str(record.get("id")));
            p.put("tid",          tid);
            p.put("cid",          clientId);
            p.put("channel",      strOrDefault(record.get("channel"), "whatsapp"));
            p.put("templateName", strOrDefault(record.get("template_name"), "unknown"));
            p.put("status",       strOrDefault(record.get("status"), "sent"));
            p.put("sentAt",       toTimestamp(record.get("sent_at")));
            p.put("created_at",   toTimestamp(record.get("created_at")));
            p.put("updated_at",   toTimestamp(record.get("updated_at")));

            jdbc.update("""
                    INSERT INTO nudge_log (id, trainer_id, client_id, channel, template_name, status, sent_at, created_at, updated_at)
                    VALUES (:id::uuid, :tid::uuid, :cid::uuid, :channel, :templateName, :status,
                        COALESCE(:sentAt, NOW()), COALESCE(:created_at, NOW()), COALESCE(:updated_at, NOW()))
                    ON CONFLICT (id) DO UPDATE SET
                        status     = EXCLUDED.status,
                        updated_at = EXCLUDED.updated_at
                    WHERE nudge_log.trainer_id = :tid::uuid
                    """, p);
        }

        for (String id : deletedIds(table)) {
            jdbc.update("""
                    UPDATE nudge_log SET deleted_at = NOW(), updated_at = NOW()
                    WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                    """, Map.of("id", id, "tid", tid));
        }
    }

    // ── Push helpers ──────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> mergeCreatedUpdated(Map<String, Object> table) {
        var result = new ArrayList<Map<String, Object>>();
        var created = (List<Map<String, Object>>) table.getOrDefault("created", List.of());
        var updated = (List<Map<String, Object>>) table.getOrDefault("updated", List.of());
        result.addAll(created);
        result.addAll(updated);
        return result;
    }

    @SuppressWarnings("unchecked")
    private List<String> deletedIds(Map<String, Object> table) {
        return (List<String>) table.getOrDefault("deleted", List.of());
    }

    private String str(Object v) {
        return v == null ? null : v.toString();
    }

    private String strOrDefault(Object v, String defaultVal) {
        String s = str(v);
        return s != null ? s : defaultVal;
    }

    /**
     * 'floor' | 'remote' | null.
     *
     * No default, unlike the status fields above: null here means "nobody has
     * said", which is what lets a session inherit its client's usual mode.
     * Defaulting it to 'floor' would make every session look like a deliberate
     * answer and the fallback would never fire.
     *
     * An unrecognised value degrades to null rather than failing the push — a
     * phone on a newer build sending a mode this server hasn't heard of should
     * lose one optional field, not the whole record.
     */
    private String deliveryMode(Object v) {
        String s = str(v);
        if (s == null) return null;
        String value = s.trim().toLowerCase();
        return value.equals("floor") || value.equals("remote") ? value : null;
    }

    private Timestamp toTimestamp(Object v) {
        if (v instanceof Number n) return Timestamp.from(Instant.ofEpochMilli(n.longValue()));
        return null;
    }

    private java.sql.Date toSqlDate(Object v) {
        if (v == null) return null;
        String s = v.toString().trim();
        if (s.isEmpty()) return null;
        try { return java.sql.Date.valueOf(s); } catch (Exception e) { return null; }
    }

    // WatermelonDB serialises JSON columns as strings; null is also valid (column is nullable).
    private String toJsonString(Object v) {
        return v == null ? null : v.toString();
    }

    // ── JDBC helpers ──────────────────────────────────────────────────────────

    private List<Map<String, Object>> queryNormalized(String sql, Map<String, ?> params) {
        return jdbc.queryForList(sql, params)
                .stream()
                .map(this::normalizeRow)
                .toList();
    }

    private List<String> queryIds(String sql, Map<String, ?> params) {
        return jdbc.queryForList(sql, params)
                .stream()
                .map(r -> r.get("id").toString())
                .toList();
    }

    private Map<String, Object> normalizeRow(Map<String, Object> raw) {
        var out = new LinkedHashMap<String, Object>(raw.size());
        for (var entry : raw.entrySet()) {
            out.put(entry.getKey(), normalizeValue(entry.getValue()));
        }
        return out;
    }

    private Object normalizeValue(Object v) {
        if (v == null)                 return null;
        if (v instanceof UUID u)                      return u.toString();
        if (v instanceof Timestamp ts)                return ts.toInstant().toEpochMilli();
        if (v instanceof java.time.OffsetDateTime odt) return odt.toInstant().toEpochMilli();
        if (v instanceof java.time.LocalDateTime ldt)  return ldt.toInstant(java.time.ZoneOffset.UTC).toEpochMilli();
        if (v instanceof Date d)                      return d.toString(); // ISO "yyyy-MM-dd"
        if (v instanceof BigDecimal bd) return bd;                    // Jackson serialises fine
        if (v instanceof Boolean || v instanceof Integer
                || v instanceof Long || v instanceof String) return v;
        return v.toString(); // PGobject (JSONB) and any other driver type
    }
}
