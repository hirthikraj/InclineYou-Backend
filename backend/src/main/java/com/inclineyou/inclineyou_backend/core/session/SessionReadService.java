package com.inclineyou.inclineyou_backend.core.session;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.wire.Cursor;
import com.inclineyou.inclineyou_backend.shared.wire.Page;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * {@code GET /v1/sessions?from=&to=} — api-contract Today L4, the diary read the
 * Schedule and the client file share.
 *
 * <p>There is no {@code workout_session} in v1: a session's log IS the
 * {@code scheduled_session} row ({@code started_at} / {@code ended_at}). So
 * <i>running</i>, <i>open log</i> and <i>late</i> are all read off these rows, and
 * the live set count rides on each one — the old screen's conditional second
 * round-trip for the running session's sets is gone.
 */
@Service
@RequiredArgsConstructor
public class SessionReadService {

    private final NamedParameterJdbcTemplate jdbc;
    private final WorkspaceClock clock;

    /**
     * A window a year wide is already more than any screen draws; the cap keeps a
     * hand-typed {@code from=2000-01-01} from turning into an unbounded read.
     */
    private static final long MAX_WINDOW_DAYS = 400;

    public record Workout(String id, String name, String programId, Integer week, Integer day) {}

    /** Only when the log was opened. {@code volumeKg} counts weight × reps sets alone — a number since 1.1. */
    public record Log(int exercises, int setsDone, BigDecimal volumeKg, Long lastSetAt) {}

    /** The live {@code package_adjustment(kind = 'session')} this session took off a pack. */
    public record Charge(String packageId) {}

    /**
     * @param version opaque — {@code updated_at} as epoch ms; the optional
     *                {@code If-Match} on {@code PATCH /v1/sessions/{id}}
     */
    public record SessionRow(
            String id,
            String clientId,
            long scheduledAt,
            long endsAt,
            int durationMinutes,
            String status,
            String deliveryMode,
            String notes,
            String slotId,
            Workout workout,
            Long startedAt,
            Long endedAt,
            Log log,
            Charge charge,
            long updatedAt,
            String version,
            /** scheduled_at at full precision, for the cursor only — never on the wire. */
            @JsonIgnore String cursorKey
    ) {}

    static final Set<String> STATUSES = Set.of("scheduled", "done", "no_show", "cancelled");

    static final int DEFAULT_LIMIT = 500;
    static final int MAX_LIMIT = 1000;

    /**
     * @param from   inclusive date, workspace timezone
     * @param to     exclusive date — Today asks for 30 days back through the end of
     *               tomorrow, so {@code to} is the day after tomorrow
     * @param status optional comma list of {@link #STATUSES}
     * @param order  {@code asc} (default) or {@code desc} — the client file's Sessions tab
     */
    public Page<SessionRow> list(UUID trainerId, String from, String to, String clientId, String status,
                                 Integer limit, String cursor, String order) {
        LocalDate fromDate = WorkspaceClock.parseDate(from, "from");
        LocalDate toDate = WorkspaceClock.parseDate(to, "to");
        if (fromDate == null || toDate == null) {
            throw ApiException.validation("from and to are required (yyyy-MM-dd)");
        }
        if (!toDate.isAfter(fromDate)) {
            throw ApiException.validation("to must be after from");
        }
        if (ChronoUnit.DAYS.between(fromDate, toDate) > MAX_WINDOW_DAYS) {
            throw ApiException.rangeTooLarge("window is limited to " + MAX_WINDOW_DAYS + " days");
        }
        boolean desc;
        if (order == null || order.isBlank() || "asc".equals(order.strip())) desc = false;
        else if ("desc".equals(order.strip())) desc = true;
        else throw ApiException.validation("order: asc or desc");
        int n = Cursor.limit(limit, DEFAULT_LIMIT, MAX_LIMIT);
        Cursor after = Cursor.decode(cursor);

        var zone = clock.zone();
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("from", Timestamp.from(WorkspaceClock.startOf(fromDate, zone)));
        p.put("to", Timestamp.from(WorkspaceClock.startOf(toDate, zone)));
        p.put("limit", n + 1);

        var where = new StringBuilder();
        if (clientId != null && !clientId.isBlank()) {
            try {
                p.put("cid", UUID.fromString(clientId.strip()).toString());
            } catch (IllegalArgumentException e) {
                throw ApiException.validation("clientId: not a client id");
            }
            where.append(" AND s.client_id = :cid::uuid");
        }
        if (status != null && !status.isBlank()) {
            var wanted = new LinkedHashSet<String>();
            for (String one : status.split(",")) {
                if (!STATUSES.contains(one.strip())) throw ApiException.validation("status: unknown value " + one.strip());
                wanted.add(one.strip());
            }
            p.put("statuses", List.copyOf(wanted));
            where.append(" AND s.status IN (:statuses)");
        }
        if (after != null) {
            p.put("afterAt", after.keyAsTimestamp());
            p.put("afterId", after.id().toString());
            where.append(desc
                    ? " AND (s.scheduled_at, s.id) < (:afterAt, :afterId::uuid)"
                    : " AND (s.scheduled_at, s.id) > (:afterAt, :afterId::uuid)");
        }
        String dir = desc ? "DESC" : "ASC";

        /*
         * Keyset on (scheduled_at, id), in either direction: without clientId the
         * page walks idx_scheduled_session_diary (trainer_id, scheduled_at), with it
         * idx_scheduled_session_client. One row past the limit is fetched so the
         * page knows whether there is another — nothing is cut off silently.
         *
         * The log aggregate is a LATERAL join gated on started_at, so a session
         * that was never opened costs nothing — and those are most of the window.
         * A removed exercise (session_exercise.removed_at) takes its sets with it:
         * the trainer took it out of the session, and the hero's "14 sets" must
         * not count work they deleted.
         *
         * The charge is read through RLS, which scopes package_adjustment to the
         * ACTIVE workspace — so a session booked in another workspace shows no
         * charge here. That is the money wall working, not a missing join.
         */
        var rows = jdbc.query(SELECT + """
                WHERE s.trainer_id = :tid::uuid AND s.deleted_at IS NULL
                  AND s.scheduled_at >= :from AND s.scheduled_at < :to
                """ + where + """

                ORDER BY s.scheduled_at %s, s.id %s
                LIMIT :limit
                """.formatted(dir, dir), p, SessionReadService::row);
        return Page.of(rows, n, r -> Cursor.encode(r.cursorKey(), r.id()));
    }

    /** One session in the L4 shape — what a write that creates or changes one answers with. */
    public Optional<SessionRow> one(UUID trainerId, UUID sessionId) {
        return jdbc.query(SELECT + """
                WHERE s.id = :sid::uuid AND s.trainer_id = :tid::uuid AND s.deleted_at IS NULL
                """, Map.of("sid", sessionId.toString(), "tid", trainerId.toString()), SessionReadService::row)
                .stream().findFirst();
    }

    private static final String SELECT = """
            SELECT s.id::text AS id, s.client_id::text AS client_id, s.scheduled_at, s.ends_at,
                   s.duration_minutes, s.status, s.delivery_mode, s.notes, s.slot_id::text AS slot_id,
                   s.started_at, s.ended_at, s.updated_at,
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
                workoutId == null ? null : new Workout(workoutId, rs.getString("workout_name"),
                        rs.getString("program_id"), intOrNull(rs, "week"), intOrNull(rs, "day")),
                started == null ? null : started.getTime(),
                ended == null ? null : ended.getTime(),
                started == null ? null : new Log(
                        rs.getInt("exercises"),
                        rs.getInt("sets_done"),
                        volume(rs.getBigDecimal("volume")),
                        epochOrNull(rs.getTimestamp("last_set_at"))),
                chargedTo == null ? null : new Charge(chargedTo),
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
}
