package com.inclineyou.inclineyou_backend.core.portal;

import com.inclineyou.inclineyou_backend.core.portal.dto.PortalHome;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * The SQL behind {@code GET /v1/portal/home}. Every statement is the signed-in client's: the row-level lens already shows a client only
 * their own rows, and each query ALSO names the client id, so a read is right on a connection the policies do not apply to and the two
 * walls fail separately.
 */
@Repository
@RequiredArgsConstructor
public class PortalHomeJdbcRepository {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final NamedParameterJdbcTemplate jdbc;

    private static Map<String, Object> p(UUID client) {
        var m = new HashMap<String, Object>();
        m.put("c", client.toString());
        return m;
    }

    private static Timestamp ts(Instant i) {
        return Timestamp.from(i);
    }

    /** A trainer-led session row as the hero draws it. */
    public record SessionRow(String id, long scheduledAt, int durationMinutes, String mode, String workoutName) {}

    private static SessionRow session(java.sql.ResultSet rs, int i) throws java.sql.SQLException {
        return new SessionRow(rs.getString("id"), rs.getTimestamp("scheduled_at").getTime(), rs.getInt("duration_minutes"),
                rs.getString("delivery_mode"), rs.getString("workout_name"));
    }

    private static final String SESSION_COLS = """
            SELECT s.id::text AS id, s.scheduled_at, s.duration_minutes, s.delivery_mode, w.name AS workout_name
              FROM scheduled_session s LEFT JOIN workout w ON w.id = s.workout_id
            """;

    /** Today's trainer-led session that has not ended: the earliest one. A booked session never shows Start — the trainer logs it. */
    public Optional<SessionRow> todaySession(UUID client, Instant now, Instant dayStart, Instant dayEnd) {
        var m = p(client);
        m.put("now", ts(now)); m.put("from", ts(dayStart)); m.put("to", ts(dayEnd));
        return jdbc.query(SESSION_COLS + """
                 WHERE s.client_id = :c::uuid AND s.logged_by = 'trainer' AND s.status = 'scheduled' AND s.deleted_at IS NULL
                   AND s.scheduled_at >= :from AND s.scheduled_at < :to AND s.ends_at > :now
                 ORDER BY s.scheduled_at LIMIT 1""", m, PortalHomeJdbcRepository::session).stream().findFirst();
    }

    /** The next trainer-led session after now, if any. */
    public Optional<SessionRow> nextSession(UUID client, Instant now) {
        var m = p(client);
        m.put("now", ts(now));
        return jdbc.query(SESSION_COLS + """
                 WHERE s.client_id = :c::uuid AND s.logged_by = 'trainer' AND s.status = 'scheduled' AND s.deleted_at IS NULL
                   AND s.scheduled_at > :now
                 ORDER BY s.scheduled_at LIMIT 1""", m, PortalHomeJdbcRepository::session).stream().findFirst();
    }

    /** A session of either kind was finished today. */
    public boolean finishedToday(UUID client, Instant dayStart, Instant dayEnd) {
        var m = p(client);
        m.put("from", ts(dayStart)); m.put("to", ts(dayEnd));
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM scheduled_session s
                                WHERE s.client_id = :c::uuid AND s.status = 'done' AND s.deleted_at IS NULL
                                  AND COALESCE(s.ended_at, s.scheduled_at) >= :from AND COALESCE(s.ended_at, s.scheduled_at) < :to)""", m, Boolean.class));
    }

    /** The trainer's session today whose time has passed and nobody has marked: that day is the trainer's, so today is a rest. */
    public boolean bookedTodayAndPast(UUID client, Instant now, Instant dayStart, Instant dayEnd) {
        var m = p(client);
        m.put("now", ts(now)); m.put("from", ts(dayStart)); m.put("to", ts(dayEnd));
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM scheduled_session s
                                WHERE s.client_id = :c::uuid AND s.logged_by = 'trainer' AND s.status = 'scheduled' AND s.deleted_at IS NULL
                                  AND s.scheduled_at >= :from AND s.scheduled_at < :to AND s.ends_at <= :now)""", m, Boolean.class));
    }

    public boolean hasActiveProgram(UUID client) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM program WHERE client_id = :c::uuid AND status = 'active' AND deleted_at IS NULL)", p(client), Boolean.class));
    }

    /**
     * The next program day (S-02): the first day, in program order, with no DONE session (of either kind) and not BOOKED to a trainer
     * session in the coming seven days. Its size comes with it so the card can say what the day is made of.
     */
    public Optional<PortalHome.Workout> nextProgramDay(UUID client, Instant now) {
        var m = p(client);
        m.put("now", ts(now)); m.put("week", ts(now.plusSeconds(7L * 86400)));
        return jdbc.query("""
                SELECT w.id::text AS id, w.name, w.week, w.day,
                       (SELECT count(*) FROM workout_exercise we WHERE we.workout_id = w.id AND we.alternative_of IS NULL) AS exercises,
                       (SELECT COALESCE(sum(COALESCE(ws.rest_seconds, 60) + 40), 0)
                          FROM workout_set ws JOIN workout_exercise we ON we.id = ws.workout_exercise_id
                         WHERE we.workout_id = w.id AND we.alternative_of IS NULL) AS seconds
                  FROM program pr JOIN workout w ON w.program_id = pr.id AND w.deleted_at IS NULL
                 WHERE pr.client_id = :c::uuid AND pr.status = 'active' AND pr.deleted_at IS NULL
                   AND NOT EXISTS (SELECT 1 FROM scheduled_session s WHERE s.workout_id = w.id AND s.client_id = :c::uuid
                                    AND s.status = 'done' AND s.deleted_at IS NULL)
                   AND NOT EXISTS (SELECT 1 FROM scheduled_session s WHERE s.workout_id = w.id AND s.client_id = :c::uuid
                                    AND s.logged_by = 'trainer' AND s.status = 'scheduled' AND s.deleted_at IS NULL
                                    AND s.scheduled_at >= :now AND s.scheduled_at < :week)
                 ORDER BY w.week, w.day, w.position, w.id LIMIT 1""", m, (rs, i) -> {
            int secs = rs.getInt("seconds");
            // About how long the day is: each set's rest plus forty seconds of work, to the nearest five, never under ten.
            int minutes = Math.max(10, (int) (Math.round(secs / 60.0 / 5.0) * 5));
            Integer week = rs.getObject("week") == null ? null : rs.getInt("week");
            Integer day = rs.getObject("day") == null ? null : rs.getInt("day");
            return new PortalHome.Workout(rs.getString("id"), rs.getString("name"), week, day, rs.getInt("exercises"), minutes);
        }).stream().findFirst();
    }

    /** A self-run session of this day that was started and not finished. */
    public Optional<String> resumable(UUID client, String workoutId) {
        var m = p(client);
        m.put("w", workoutId);
        return jdbc.queryForList("""
                SELECT s.id::text FROM scheduled_session s
                 WHERE s.client_id = :c::uuid AND s.workout_id = :w::uuid AND s.logged_by = 'client' AND s.deleted_at IS NULL
                   AND s.started_at IS NOT NULL AND s.ended_at IS NULL AND s.status NOT IN ('done', 'cancelled', 'no_show')
                 ORDER BY s.started_at DESC LIMIT 1""", m, String.class).stream().findFirst();
    }

    /** The newest general line from the trainer. A recap belongs to its session and never appears here. */
    public Optional<PortalHome.Message> latestMessage(UUID client, String trainerName) {
        return jdbc.query("""
                SELECT id::text AS id, kind, body, at, read_at FROM client_message
                 WHERE client_id = :c::uuid AND session_id IS NULL AND kind IN ('note', 'weekly') AND deleted_at IS NULL
                 ORDER BY at DESC, id LIMIT 1""", p(client), (rs, i) -> new PortalHome.Message(rs.getString("id"), rs.getString("kind"),
                rs.getString("body"), rs.getTimestamp("at").getTime(), rs.getTimestamp("read_at") == null ? null : rs.getTimestamp("read_at").getTime(),
                trainerName)).stream().findFirst();
    }

    /**
     * The active package's balance, through {@code client_package_balance()} (V11): sessions and dates and never a price, and not
     * behind the trainer's money switch. Empty when the client has none.
     */
    public Optional<PortalHome.Pack> activePackage(UUID client) {
        String json = jdbc.queryForObject("SELECT client_package_balance(:c::uuid)::text", p(client), String.class);
        for (JsonNode n : JSON.readTree(json)) {
            if (!"active".equals(n.path("status").asString())) continue;
            return Optional.of(new PortalHome.Pack(n.path("sessions_left").asInt(0), n.path("sessions_total").asInt(0),
                    n.path("ends_on").isString() ? n.path("ends_on").asString() : null, n.path("paused").asBoolean(false)));
        }
        return Optional.empty();
    }

    public record DoneSession(String id, Instant at) {}

    /** The most recent finished session of either kind. */
    public Optional<DoneSession> lastDone(UUID client) {
        return jdbc.query("""
                SELECT id::text AS id, COALESCE(ended_at, scheduled_at) AS at FROM scheduled_session
                 WHERE client_id = :c::uuid AND status = 'done' AND deleted_at IS NULL
                 ORDER BY COALESCE(ended_at, scheduled_at) DESC, id LIMIT 1""", p(client),
                (rs, i) -> new DoneSession(rs.getString("id"), rs.getTimestamp("at").toInstant())).stream().findFirst();
    }

    /** Sets done and kilograms moved (weight × reps sets, the product's one definition of volume) in one session. */
    public record Totals(int setsDone, BigDecimal volumeKg) {}

    public Totals totals(UUID client, String sessionId) {
        var m = p(client);
        m.put("s", sessionId);
        return jdbc.queryForObject("""
                SELECT count(sl.id) AS sets,
                       COALESCE(sum(sl.load_value * sl.effort_value) FILTER (WHERE sl.load_kind = 'weight' AND sl.effort_kind = 'reps'), 0) AS volume
                  FROM session_exercise se JOIN set_log sl ON sl.session_exercise_id = se.id
                 WHERE se.session_id = :s::uuid AND se.client_id = :c::uuid AND se.removed_at IS NULL AND sl.done_at IS NOT NULL""", m,
                (rs, i) -> new Totals(rs.getInt("sets"), rs.getBigDecimal("volume").setScale(2, java.math.RoundingMode.HALF_UP).stripTrailingZeros()));
    }

    /**
     * Personal bests set in that session: an exercise whose heaviest done weight × reps set beat every earlier one of this client's.
     * A first time is not a best — there is nothing to beat — so an exercise needs a history. At most three, biggest jump first.
     */
    public List<PortalHome.NewBest> newBests(UUID client, String sessionId, Instant sessionAt) {
        var m = p(client);
        m.put("s", sessionId); m.put("at", ts(sessionAt));
        return jdbc.query("""
                WITH cur AS (
                    SELECT DISTINCT ON (se.exercise_id) se.exercise_id, sl.load_value, sl.effort_value
                      FROM session_exercise se JOIN set_log sl ON sl.session_exercise_id = se.id
                     WHERE se.session_id = :s::uuid AND se.client_id = :c::uuid AND se.removed_at IS NULL AND sl.done_at IS NOT NULL
                       AND sl.load_kind = 'weight' AND sl.effort_kind = 'reps' AND sl.load_value IS NOT NULL
                     ORDER BY se.exercise_id, sl.load_value DESC, sl.effort_value DESC),
                prior AS (
                    SELECT se.exercise_id, max(sl.load_value) AS best
                      FROM session_exercise se JOIN set_log sl ON sl.session_exercise_id = se.id
                     WHERE se.client_id = :c::uuid AND se.session_id <> :s::uuid AND se.removed_at IS NULL AND sl.done_at IS NOT NULL
                       AND sl.done_at < :at AND sl.load_kind = 'weight' AND sl.effort_kind = 'reps' AND sl.load_value IS NOT NULL
                     GROUP BY se.exercise_id)
                SELECT cur.exercise_id::text AS id, e.name, cur.load_value, cur.effort_value
                  FROM cur JOIN prior ON prior.exercise_id = cur.exercise_id JOIN exercise e ON e.id = cur.exercise_id
                 WHERE cur.load_value > prior.best
                 ORDER BY (cur.load_value - prior.best) DESC, e.name LIMIT 3""", m, (rs, i) -> new PortalHome.NewBest(rs.getString("id"), rs.getString("name"),
                rs.getBigDecimal("load_value").stripTrailingZeros(), rs.getBigDecimal("effort_value") == null ? null : rs.getBigDecimal("effort_value").stripTrailingZeros()));
    }

    /** The trainer's note about one session, if there is one. */
    public Optional<PortalHome.RecapMessage> recapMessage(UUID client, String sessionId) {
        var m = p(client);
        m.put("s", sessionId);
        return jdbc.query("""
                SELECT id::text AS id, body, read_at FROM client_message
                 WHERE client_id = :c::uuid AND session_id = :s::uuid AND kind = 'recap' AND deleted_at IS NULL LIMIT 1""", m,
                (rs, i) -> new PortalHome.RecapMessage(rs.getString("id"), rs.getString("body"),
                        rs.getTimestamp("read_at") == null ? null : rs.getTimestamp("read_at").getTime())).stream().findFirst();
    }

    /** A milestone in the last 72 hours — a moment, not a shelf. */
    public Optional<PortalHome.Milestone> recentMilestone(UUID client, Instant now) {
        var m = p(client);
        m.put("since", ts(now.minusSeconds(72L * 3600)));
        return jdbc.query("""
                SELECT kind, label, at FROM milestone WHERE client_id = :c::uuid AND deleted_at IS NULL AND at >= :since
                 ORDER BY at DESC, id LIMIT 1""", m, (rs, i) -> new PortalHome.Milestone(rs.getString("kind"), rs.getString("label"),
                rs.getTimestamp("at").getTime())).stream().findFirst();
    }

    /** Assessments sent to this client and not yet submitted: how many, how many are late against their own day, and the next one due. */
    public Optional<PortalHome.Assessments> assessments(UUID client, java.time.LocalDate today) {
        var m = p(client);
        m.put("today", java.sql.Date.valueOf(today));
        var open = jdbc.query("""
                SELECT id::text AS id, name, due_on FROM assessment
                 WHERE client_id = :c::uuid AND sent_at IS NOT NULL AND completed_at IS NULL AND deleted_at IS NULL
                 ORDER BY due_on, created_at, id""", m, (rs, i) -> new Object[]{rs.getString("id"), rs.getString("name"), rs.getDate("due_on").toLocalDate()});
        if (open.isEmpty()) return Optional.empty();
        int late = (int) open.stream().filter(o -> ((java.time.LocalDate) o[2]).isBefore(today)).count();
        var next = open.getFirst();
        return Optional.of(new PortalHome.Assessments(open.size(), late,
                new PortalHome.Assessments.Next((String) next[0], (String) next[1], next[2].toString())));
    }
}
