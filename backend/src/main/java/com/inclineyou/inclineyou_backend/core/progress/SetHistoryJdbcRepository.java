package com.inclineyou.inclineyou_backend.core.progress;

import com.inclineyou.inclineyou_backend.core.progress.dto.Exercise;
import com.inclineyou.inclineyou_backend.core.progress.dto.SetHistoryQuery;
import com.inclineyou.inclineyou_backend.core.progress.dto.SetRow;
import com.inclineyou.inclineyou_backend.shared.wire.Cursor;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * All SQL behind set-history: set_log ⋈ session_exercise (this client, not removed) ⋈ scheduled_session for the
 * date. {@code idx_session_exercise_history (client_id, exercise_id)} narrows it to one client. What the window,
 * the cursor and the limit MEAN is {@link SetHistoryService}'s; this class only runs them.
 */
@Repository
@RequiredArgsConstructor
public class SetHistoryJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /** Is this client on this trainer's roster? The history is the client's, so this is the only ownership test. */
    public boolean clientOnRoster(UUID trainerId, UUID clientId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM client WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)
                """, Map.of("cid", clientId.toString(), "tid", trainerId.toString()), Boolean.class));
    }

    /** Completed sets, oldest first, {@code q.fetch()} of them. {@code tz} is the workspace zone the day is read in. */
    public List<SetRow> sets(String tz, SetHistoryQuery q) {
        var p = new HashMap<String, Object>();
        p.put("cid", q.clientId().toString());
        p.put("tz", tz);
        p.put("limit", q.fetch());
        var where = new ArrayList<String>(List.of(
                "se.client_id = :cid::uuid", "se.removed_at IS NULL", "sl.done_at IS NOT NULL", "s.deleted_at IS NULL"));
        if (q.from() != null) {
            p.put("from", Timestamp.from(q.from()));
            where.add("s.scheduled_at >= :from");
        }
        if (q.exerciseId() != null) {
            p.put("ex", q.exerciseId().toString());
            where.add("se.exercise_id = :ex::uuid");
        }
        if (q.after() != null) {
            var a = q.after();
            p.put("aAt", Timestamp.from(a.scheduledAt()));
            p.put("aSession", a.sessionId().toString());
            p.put("aExPos", a.exercisePosition());
            p.put("aSetPos", a.setPosition());
            p.put("aId", a.setId().toString());
            where.add("(s.scheduled_at, s.id, se.position, sl.position, sl.id) > (:aAt, :aSession::uuid, :aExPos, :aSetPos, :aId::uuid)");
        }
        return jdbc.query("""
                SELECT s.id::text AS session_id, (s.scheduled_at AT TIME ZONE :tz)::date::text AS day,
                       s.scheduled_at, se.exercise_id::text AS exercise_id, se.position AS ex_pos,
                       sl.id::text AS set_id, sl.position, sl.load_kind, sl.effort_kind,
                       sl.load_value, sl.effort_value, sl.rpe, sl.done_at, w.name AS workout_name
                FROM set_log sl
                JOIN session_exercise se ON se.id = sl.session_exercise_id
                JOIN scheduled_session s ON s.id = se.session_id
                LEFT JOIN workout w ON w.id = s.workout_id
                WHERE %s
                ORDER BY s.scheduled_at, s.id, se.position, sl.position, sl.id
                LIMIT :limit
                """.formatted(String.join(" AND ", where)), p, (rs, i) -> new SetRow(
                rs.getString("session_id"), rs.getString("day"), rs.getString("exercise_id"), rs.getInt("position"),
                rs.getString("load_kind"), rs.getString("effort_kind"),
                number(rs.getBigDecimal("load_value")), number(rs.getBigDecimal("effort_value")),
                number(rs.getBigDecimal("rpe")), rs.getTimestamp("done_at").getTime(),
                Cursor.key(rs.getTimestamp("scheduled_at")) + "~" + rs.getString("session_id") + "~"
                        + rs.getInt("ex_pos") + "~" + rs.getInt("position"),
                rs.getString("set_id"), rs.getString("workout_name")));
    }

    /** Names for the exercises on one page, alphabetical. */
    public Map<String, Exercise> exercises(List<String> ids) {
        var out = new LinkedHashMap<String, Exercise>();
        if (ids.isEmpty()) return out;
        jdbc.query("""
                SELECT id::text AS id, name, equipment, origin <> 'inclineyou' AS custom
                FROM exercise WHERE id::text IN (:ids) ORDER BY name
                """, Map.of("ids", ids), rs -> {
            out.put(rs.getString("id"),
                    new Exercise(rs.getString("name"), rs.getString("equipment"), rs.getBoolean("custom")));
        });
        return out;
    }

    /** A JSON number — 80, not "80.00" and not 8E+1. */
    private static Double number(BigDecimal v) {
        return v == null ? null : v.doubleValue();
    }
}
