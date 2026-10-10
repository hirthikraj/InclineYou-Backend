package com.inclineyou.inclineyou_backend.core.session;

import com.inclineyou.inclineyou_backend.core.session.dto.ClientStanding;
import com.inclineyou.inclineyou_backend.core.session.dto.NewSession;
import com.inclineyou.inclineyou_backend.core.session.dto.SessionCharge;
import com.inclineyou.inclineyou_backend.core.session.dto.SessionLogTotals;
import com.inclineyou.inclineyou_backend.core.session.dto.SessionOwner;
import com.inclineyou.inclineyou_backend.core.session.dto.SessionRow;
import com.inclineyou.inclineyou_backend.core.session.dto.SessionWorkout;
import com.inclineyou.inclineyou_backend.shared.wire.Cursor;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * All SQL for reading the diary and for booking into it: the L4 row (one definition, here), the keyset window, and the
 * lookups a booking decides on. A session's log IS its {@code scheduled_session} row, so there is no second table to
 * join for "was it opened". What a window MEANS, and what a booking may do, is {@link SessionReadService}'s and
 * {@link SessionBookingService}'s; the status verbs and the charges are {@link SessionStateJdbcRepository}'s.
 */
@Repository
@RequiredArgsConstructor
public class SessionJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /* ──────────────────────────────────────────────────────────── the diary ── */

    /**
     * Keyset on (scheduled_at, id), in either direction: without a client the page walks idx_scheduled_session_diary
     * (trainer_id, scheduled_at), with one idx_scheduled_session_client. {@code fetch} is one past the page so the
     * caller knows whether there is another — nothing is cut off silently.
     *
     * <p>The log aggregate is a LATERAL join gated on started_at, so a session that was never opened costs nothing —
     * and those are most of the window. A removed exercise (session_exercise.removed_at) takes its sets with it: the
     * trainer took it out of the session, and the hero's "14 sets" must not count work they deleted.
     *
     * <p>The charge is read through RLS, which scopes package_adjustment to the ACTIVE workspace — so a session booked
     * in another workspace shows no charge here. That is the money wall working, not a missing join.
     */
    public List<SessionRow> page(UUID trainerId, Instant from, Instant to, UUID clientId, List<String> statuses,
                                 Cursor after, boolean desc, int fetch) {
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("from", Timestamp.from(from));
        p.put("to", Timestamp.from(to));
        p.put("limit", fetch);
        var where = new StringBuilder();
        if (clientId != null) {
            p.put("cid", clientId.toString());
            where.append(" AND s.client_id = :cid::uuid");
        }
        if (statuses != null && !statuses.isEmpty()) {
            p.put("statuses", statuses);
            where.append(" AND s.status IN (:statuses)");
        }
        if (after != null) {
            p.put("afterAt", after.keyAsTimestamp());
            p.put("afterId", after.id().toString());
            where.append(desc
                    ? " AND (s.scheduled_at, s.id) < (:afterAt, :afterId::uuid)"
                    : " AND (s.scheduled_at, s.id) > (:afterAt, :afterId::uuid)");
        }
        // R107: a workout the client did alone is not in the trainer's time. The diary never lists it; one client's own
        // history does, but only once a set is done, so an abandoned Start leaves no trace.
        where.append(clientId == null ? " AND s.logged_by = 'trainer'" : " AND " + HAS_WORK);
        String dir = desc ? "DESC" : "ASC";
        return jdbc.query(SELECT + """
                WHERE s.trainer_id = :tid::uuid AND s.deleted_at IS NULL
                  AND s.scheduled_at >= :from AND s.scheduled_at < :to
                """ + where + """

                ORDER BY s.scheduled_at %s, s.id %s
                LIMIT :limit
                """.formatted(dir, dir), p, SessionJdbcRepository::row);
    }

    /** One session in the L4 shape — what a write that creates or changes one answers with. */
    public Optional<SessionRow> one(UUID trainerId, UUID sessionId) {
        return jdbc.query(SELECT + """
                WHERE s.id = :sid::uuid AND s.trainer_id = :tid::uuid AND s.deleted_at IS NULL
                """, Map.of("sid", sessionId.toString(), "tid", trainerId.toString()), SessionJdbcRepository::row)
                .stream().findFirst();
    }

    /** A trainer's booking, or a client's own workout with at least one set done. */
    private static final String HAS_WORK = """
            (s.logged_by = 'trainer' OR EXISTS (
                SELECT 1 FROM session_exercise hx JOIN set_log hs ON hs.session_exercise_id = hx.id
                WHERE hx.session_id = s.id AND hx.removed_at IS NULL AND hs.done_at IS NOT NULL))""";

    private static final String SELECT = """
            SELECT s.id::text AS id, s.client_id::text AS client_id, s.scheduled_at, s.ends_at,
                   s.duration_minutes, s.status, s.delivery_mode, s.notes, s.slot_id::text AS slot_id,
                   s.logged_by, s.started_at, s.ended_at, s.updated_at,
                   w.id::text AS workout_id, w.name AS workout_name, w.program_id::text AS program_id,
                   w.week, w.day,
                   lg.exercises, lg.sets_done, lg.volume, lg.last_set_at,
                   ch.package_id::text AS charge_package_id
            FROM scheduled_session s
            LEFT JOIN workout w ON w.id = s.workout_id
            LEFT JOIN LATERAL (
                SELECT count(DISTINCT se.id) AS exercises,
                       count(sl.id) FILTER (WHERE sl.done_at IS NOT NULL) AS sets_done,
                       coalesce(sum(sl.load_value * sl.effort_value)
                                FILTER (WHERE sl.done_at IS NOT NULL
                                          AND sl.load_kind = 'weight' AND sl.effort_kind = 'reps'), 0) AS volume,
                       max(sl.done_at) AS last_set_at
                FROM session_exercise se
                LEFT JOIN set_log sl ON sl.session_exercise_id = se.id
                WHERE se.session_id = s.id AND se.removed_at IS NULL
            ) lg ON s.started_at IS NOT NULL
            LEFT JOIN package_adjustment ch
                   ON ch.session_id = s.id AND ch.kind = 'session' AND ch.reversed_at IS NULL
            """;

    private static SessionRow row(ResultSet rs, int i) throws SQLException {
        Timestamp started = rs.getTimestamp("started_at");
        Timestamp ended = rs.getTimestamp("ended_at");
        String workoutId = rs.getString("workout_id");
        String chargedTo = rs.getString("charge_package_id");
        return new SessionRow(
                rs.getString("id"),
                rs.getString("client_id"),
                rs.getTimestamp("scheduled_at").getTime(),
                rs.getTimestamp("ends_at").getTime(),
                rs.getInt("duration_minutes"),
                rs.getString("status"),
                rs.getString("delivery_mode"),
                rs.getString("notes"),
                rs.getString("slot_id"),
                rs.getString("logged_by"),
                workoutId == null ? null : new SessionWorkout(workoutId, rs.getString("workout_name"),
                        rs.getString("program_id"), intOrNull(rs, "week"), intOrNull(rs, "day")),
                started == null ? null : started.getTime(),
                ended == null ? null : ended.getTime(),
                started == null ? null : new SessionLogTotals(
                        rs.getInt("exercises"),
                        rs.getInt("sets_done"),
                        volume(rs.getBigDecimal("volume")),
                        epochOrNull(rs.getTimestamp("last_set_at"))),
                chargedTo == null ? null : new SessionCharge(chargedTo),
                rs.getTimestamp("updated_at").getTime(),
                String.valueOf(rs.getTimestamp("updated_at").getTime()),
                Cursor.key(rs.getTimestamp("scheduled_at")));
    }

    /** Kilograms to two places, as a JSON number — never a string (1.1: only money is a string). */
    private static BigDecimal volume(BigDecimal v) {
        return (v == null ? BigDecimal.ZERO : v).setScale(2, RoundingMode.HALF_UP).stripTrailingZeros();
    }

    private static Integer intOrNull(ResultSet rs, String column) throws SQLException {
        int v = rs.getInt(column);
        return rs.wasNull() ? null : v;
    }

    private static Long epochOrNull(Timestamp ts) {
        return ts == null ? null : ts.getTime();
    }

    /* ─────────────────────────────────────────────────────────── the booking ── */

    /** Who an id already belongs to, anywhere (RLS permitting) — for a replay. */
    public Optional<SessionOwner> ownerOf(UUID sessionId) {
        return jdbc.query("SELECT trainer_id::text AS tid, client_id::text AS cid FROM scheduled_session WHERE id = :id::uuid",
                Map.of("id", sessionId.toString()),
                (rs, i) -> new SessionOwner(rs.getString("tid"), rs.getString("cid"))).stream().findFirst();
    }

    /**
     * The client, locked, so a pause or archive landing at the same moment is seen before the booking, not after it.
     * Empty when the client is not this trainer's or is deleted.
     */
    public Optional<ClientStanding> lockClient(UUID trainerId, UUID clientId) {
        return jdbc.query("""
                SELECT c.status, c.membership_status, cs.session_duration_minutes
                FROM client c LEFT JOIN client_schedule cs ON cs.client_id = c.id
                WHERE c.id = :cid::uuid AND c.trainer_id = :tid::uuid AND c.deleted_at IS NULL
                FOR UPDATE OF c
                """, Map.of("cid", clientId.toString(), "tid", trainerId.toString()),
                (rs, i) -> new ClientStanding(rs.getString("status"), rs.getString("membership_status"),
                        (Integer) rs.getObject("session_duration_minutes"))).stream().findFirst();
    }

    /**
     * Whether this client can be given the workout: a day of their own program, or a standalone workout off the
     * trainer's shelf or the InclineYou library.
     */
    public boolean workoutGivable(UUID trainerId, UUID clientId, UUID workoutId) {
        return !jdbc.queryForList("""
                SELECT 1 FROM workout w
                LEFT JOIN program pr ON pr.id = w.program_id
                WHERE w.id = :wid::uuid AND w.deleted_at IS NULL
                  AND ((w.program_id IS NOT NULL AND pr.client_id = :cid::uuid AND pr.deleted_at IS NULL)
                       OR (w.program_id IS NULL AND (w.trainer_id = :tid::uuid OR w.origin = 'inclineyou')))
                """, Map.of("wid", workoutId.toString(), "cid", clientId.toString(), "tid", trainerId.toString())).isEmpty();
    }

    /**
     * The next workout in the client's active program: the one after the workout of their latest session booked before
     * {@code at} that points into the same program, in the program's order (week, day, position); the first workout
     * when there is no such session; none once the last has been booked.
     */
    public Optional<UUID> nextWorkout(UUID clientId, Instant at) {
        return jdbc.queryForList("""
                WITH plan AS (
                    SELECT w.id, row_number() OVER (ORDER BY w.week, w.day, w.position, w.id) AS n
                    FROM program pr
                    JOIN workout w ON w.program_id = pr.id AND w.deleted_at IS NULL
                    WHERE pr.client_id = :cid::uuid AND pr.status = 'active' AND pr.deleted_at IS NULL
                ),
                last AS (
                    SELECT plan.n FROM scheduled_session s JOIN plan ON plan.id = s.workout_id
                    WHERE s.client_id = :cid::uuid AND s.deleted_at IS NULL AND s.status <> 'cancelled'
                      AND (s.logged_by = 'trainer' OR s.status = 'done')   -- R107: a finished self-run day counts as done
                      AND s.scheduled_at < :at
                    ORDER BY s.scheduled_at DESC, s.id DESC
                    LIMIT 1
                )
                SELECT plan.id::text FROM plan
                WHERE plan.n = coalesce((SELECT n FROM last), 0) + 1
                """, Map.of("cid", clientId.toString(), "at", Timestamp.from(at)), String.class)
                .stream().findFirst().map(UUID::fromString);
    }

    /** ends_at is set_session_ends_at's, tenant_id is stamp_tenant_id's. */
    public void insert(NewSession s) {
        var p = new HashMap<String, Object>();
        p.put("id", s.id().toString());
        p.put("tid", s.trainerId().toString());
        p.put("cid", s.clientId().toString());
        p.put("at", Timestamp.from(s.scheduledAt()));
        p.put("minutes", s.durationMinutes());
        p.put("workout", s.workoutId() == null ? null : s.workoutId().toString());
        p.put("mode", s.deliveryMode());
        p.put("notes", s.notes());
        jdbc.update("""
                INSERT INTO scheduled_session (id, trainer_id, client_id, workout_id, scheduled_at,
                                               duration_minutes, ends_at, delivery_mode, notes)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, :workout::uuid, :at,
                        :minutes, :at, :mode, :notes)
                """, p);
    }
}
