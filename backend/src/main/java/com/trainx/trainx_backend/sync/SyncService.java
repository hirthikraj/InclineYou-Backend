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
    ) {
        static TableChanges of(List<Map<String, Object>> alive, List<String> dead) {
            return new TableChanges(alive, List.of(), dead);
        }
    }

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

        return TableChanges.of(queryNormalized(aliveSql, params), queryIds(deadSql, params));
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

        return TableChanges.of(queryNormalized(aliveSql, params), queryIds(deadSql, params));
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

        return TableChanges.of(queryNormalized(aliveSql, params), queryIds(deadSql, params));
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

        return TableChanges.of(queryNormalized(aliveSql, params), queryIds(deadSql, params));
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

        return TableChanges.of(queryNormalized(aliveSql, params), queryIds(deadSql, params));
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
        warnOnUnhandledTables(tid, changes);
        log.debug("sync push trainer={} tables={}", tid, changes.keySet());
    }

    // M0 only persists clients and body_metrics. WatermelonDB marks everything in a
    // push as synced once we return 2xx, so anything we silently ignore is lost from
    // the device's queue. Shout about it until the remaining tables are implemented.
    private static final Set<String> HANDLED_PUSH_TABLES = Set.of("clients", "body_metrics");

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
            p.put("metadata",              toJsonString(record.get("metadata")));
            p.put("created_at",            toTimestamp(record.get("created_at")));
            p.put("updated_at",            toTimestamp(record.get("updated_at")));

            jdbc.update("""
                    INSERT INTO client (id, trainer_id, name, phone, goal, status, payment_mode,
                        trainer_split_percent, height_cm, activity_level, metadata, created_at, updated_at)
                    VALUES (:id::uuid, :tid::uuid, :name, :phone, :goal, :status, :payment_mode,
                        :trainer_split_percent, :height_cm, :activity_level,
                        CAST(:metadata AS jsonb), COALESCE(:created_at, NOW()), COALESCE(:updated_at, NOW()))
                    ON CONFLICT (id) DO UPDATE SET
                        name                  = EXCLUDED.name,
                        phone                 = EXCLUDED.phone,
                        goal                  = EXCLUDED.goal,
                        status                = EXCLUDED.status,
                        payment_mode          = EXCLUDED.payment_mode,
                        trainer_split_percent = EXCLUDED.trainer_split_percent,
                        height_cm             = EXCLUDED.height_cm,
                        activity_level        = EXCLUDED.activity_level,
                        metadata              = EXCLUDED.metadata,
                        updated_at            = EXCLUDED.updated_at
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

    private Timestamp toTimestamp(Object v) {
        if (v instanceof Number n) return Timestamp.from(Instant.ofEpochMilli(n.longValue()));
        return null;
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
