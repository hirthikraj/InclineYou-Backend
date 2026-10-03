package com.inclineyou.inclineyou_backend.core.progress;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.wire.Cursor;
import com.inclineyou.inclineyou_backend.shared.wire.Page;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * {@code GET /v1/clients/{id}/set-history} — every completed set for one client,
 * oldest first, with each exercise's name once per page rather than once per set.
 *
 * <p>It replaces what Progress used to download to draw one client's lifts: every
 * client, the whole library and every workout on the account. Personal bests and
 * weekly volume stay in the frontend's {@code buildProgress}, which now gets
 * exactly the rows it needs.
 *
 * <p>set_log ⋈ session_exercise (this client, not removed) ⋈ scheduled_session
 * for the date; {@code idx_session_exercise_history (client_id, exercise_id)}
 * narrows it to one client. Filtered by the CLIENT being this trainer's, not by
 * who ran each session — the history is the client's.
 */
@Service
@RequiredArgsConstructor
public class SetHistoryService {

    private final NamedParameterJdbcTemplate jdbc;
    private final WorkspaceClock clock;

    public record Exercise(String name, String equipment, boolean custom) {}

    public record SetRow(String sessionId, String date, String exerciseId, int position,
                         String loadKind, String effortKind, Double loadValue, Double effortValue,
                         Double rpe, long doneAt,
                         /** The keyset position, never on the wire. */
                         @JsonIgnore String cursorKey,
                         /** The set_log id — on the wire since 3 Oct so a past set can be corrected (PATCH /v1/sessions/{sessionId}/sets/{setId}). */
                         String setId,
                         /** Read in the same query (scheduled_session.workout_id → workout.name); lifted into {@code sessions}. */
                         @JsonIgnore String workoutName) {}

    /** What is worth saying about a session once per page rather than on every set: the workout it ran, if it had one. */
    public record SessionInfo(String workoutName) {}

    /**
     * {@code sessions} is keyed by session id and holds only the sessions that appear on THIS page — the same idiom as
     * {@code exercises}, so a client's 5,000-set page doesn't repeat a workout name 5,000 times. Appended last: every
     * existing field keeps its place.
     */
    public record History(Map<String, Exercise> exercises, List<SetRow> items, String nextCursor,
                          Map<String, SessionInfo> sessions) {}

    public History list(UUID tid, UUID clientId, String from, String exerciseId, Integer limit, String cursor) {
        var p = new HashMap<String, Object>();
        p.put("tid", tid.toString());
        p.put("cid", clientId.toString());
        Boolean mine = jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM client WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)
                """, p, Boolean.class);
        if (!Boolean.TRUE.equals(mine)) throw ApiException.notFound("That client is not on your roster.");

        var zone = clock.zone();
        p.put("tz", zone.getId());
        var where = new ArrayList<String>(List.of(
                "se.client_id = :cid::uuid", "se.removed_at IS NULL", "sl.done_at IS NOT NULL", "s.deleted_at IS NULL"));
        LocalDate fromDate = WorkspaceClock.parseDate(from, "from");
        if (fromDate != null) {
            p.put("from", Timestamp.from(WorkspaceClock.startOf(fromDate, zone)));
            where.add("s.scheduled_at >= :from");
        }
        if (exerciseId != null && !exerciseId.isBlank()) {
            try {
                p.put("ex", UUID.fromString(exerciseId.strip()).toString());
            } catch (IllegalArgumentException e) {
                throw ApiException.validation("exerciseId: not an id");
            }
            where.add("se.exercise_id = :ex::uuid");
        }
        Cursor after = Cursor.decode(cursor);
        if (after != null) {
            // key = scheduledAt~sessionId~exercisePosition~setPosition; id = the set.
            String[] k = after.key().split("~");
            if (k.length != 4) throw ApiException.validation("cursor: not a cursor from this list");
            try {
                p.put("aAt", Timestamp.from(java.time.Instant.parse(k[0])));
                p.put("aSession", UUID.fromString(k[1]).toString());
                p.put("aExPos", Integer.parseInt(k[2]));
                p.put("aSetPos", Integer.parseInt(k[3]));
            } catch (RuntimeException e) {
                throw ApiException.validation("cursor: not a cursor from this list");
            }
            p.put("aId", after.id().toString());
            where.add("(s.scheduled_at, s.id, se.position, sl.position, sl.id) > (:aAt, :aSession::uuid, :aExPos, :aSetPos, :aId::uuid)");
        }
        int n = Cursor.limit(limit, 5000, 10000);
        p.put("limit", n + 1);

        var rows = jdbc.query("""
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
        var page = Page.of(rows, n, r -> Cursor.encode(r.cursorKey(), r.setId()));

        var exercises = new LinkedHashMap<String, Exercise>();
        var ids = page.items().stream().map(SetRow::exerciseId).distinct().toList();
        if (!ids.isEmpty()) {
            jdbc.query("""
                    SELECT id::text AS id, name, equipment, origin <> 'inclineyou' AS custom
                    FROM exercise WHERE id::text IN (:ids) ORDER BY name
                    """, Map.of("ids", ids), rs -> {
                exercises.put(rs.getString("id"),
                        new Exercise(rs.getString("name"), rs.getString("equipment"), rs.getBoolean("custom")));
            });
        }
        var sessions = new LinkedHashMap<String, SessionInfo>();
        for (var r : page.items()) sessions.putIfAbsent(r.sessionId(), new SessionInfo(r.workoutName()));
        return new History(exercises, page.items(), page.nextCursor(), sessions);
    }

    /** A JSON number — 80, not "80.00" and not 8E+1. */
    private static Double number(BigDecimal v) {
        return v == null ? null : v.doubleValue();
    }
}
