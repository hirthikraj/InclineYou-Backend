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

    // ── Push (stub — M0 trainers work online; push will be wired in a later phase) ──

    public void push(UUID trainerId, Map<String, Object> body) {
        log.debug("sync push trainer={} (stub — changes ignored in M0)", trainerId);
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
        if (v instanceof UUID u)       return u.toString();
        if (v instanceof Timestamp ts) return ts.toInstant().toEpochMilli();
        if (v instanceof Date d)       return d.toString();           // ISO "yyyy-MM-dd"
        if (v instanceof BigDecimal bd) return bd;                    // Jackson serialises fine
        if (v instanceof Boolean || v instanceof Integer
                || v instanceof Long || v instanceof String) return v;
        return v.toString(); // PGobject (JSONB) and any other driver type
    }
}
