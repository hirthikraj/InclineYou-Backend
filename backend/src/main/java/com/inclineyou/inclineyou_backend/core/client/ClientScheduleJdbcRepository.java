package com.inclineyou.inclineyou_backend.core.client;

import com.inclineyou.inclineyou_backend.core.client.dto.CreateClientRequest;
import com.inclineyou.inclineyou_backend.core.client.dto.PutScheduleRequest;
import com.inclineyou.inclineyou_backend.core.client.dto.ScheduleSaved;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static com.inclineyou.inclineyou_backend.core.client.ClientJdbcRepository.intOrNull;
import static com.inclineyou.inclineyou_backend.core.client.ClientJdbcRepository.params;

/**
 * The SQL on a client's week: {@code client_schedule}, {@code client_schedule_slot},
 * and the {@code scheduled_session} rows the slots book, cancel and restore.
 */
@Repository
@RequiredArgsConstructor
public class ClientScheduleJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /** The client locked, with what every Clients verb decides on. */
    public record LockedClient(String status, String membershipStatus, Instant pausedAt, LocalDate pausedUntil,
                               String scheduleVersion, Integer programDays) {
        public boolean archived() { return "archived".equals(status); }
        public boolean paused() { return "paused".equals(status); }

        /** Slot booking skips a paused client and one whose membership is removed (R21, CLIENT_NOT_BOOKABLE). */
        public boolean bookable() {
            return ("active".equals(status) || "inactive".equals(status)) && !"removed".equals(membershipStatus);
        }
    }

    public record LiveSlot(String id, int weekday, LocalTime start, Integer programDay, Integer durationMinutes,
                           String deliveryMode) {}

    /** Locks the client row (FOR UPDATE OF c). Empty when not this trainer's. */
    public Optional<LockedClient> lock(UUID trainerId, UUID clientId) {
        return jdbc.query("""
                SELECT c.status, c.membership_status, c.paused_at, c.paused_until, cs.updated_at AS schedule_updated_at,
                       (SELECT pr.days FROM program pr WHERE pr.client_id = c.id AND pr.status = 'active'
                          AND pr.deleted_at IS NULL) AS program_days
                FROM client c JOIN client_schedule cs ON cs.client_id = c.id
                WHERE c.id = :cid::uuid AND c.trainer_id = :tid::uuid AND c.deleted_at IS NULL
                FOR UPDATE OF c
                """, params(trainerId, clientId), (rs, i) -> {
            Timestamp pausedAt = rs.getTimestamp("paused_at");
            Date pausedUntil = rs.getDate("paused_until");
            return new LockedClient(rs.getString("status"), rs.getString("membership_status"),
                    pausedAt == null ? null : pausedAt.toInstant(),
                    pausedUntil == null ? null : pausedUntil.toLocalDate(),
                    String.valueOf(rs.getTimestamp("schedule_updated_at").getTime()),
                    intOrNull(rs, "program_days"));
        }).stream().findFirst();
    }

    // ── client_schedule ────────────────────────────────────────────────────────

    /** The add flow's defaults, onto the row ensure_client_schedule made. */
    public void setDefaults(UUID clientId, CreateClientRequest.Schedule s) {
        var p = new HashMap<String, Object>();
        p.put("cid", clientId.toString());
        p.put("mode", s.deliveryMode());
        p.put("minutes", s.sessionDurationMinutes());
        p.put("perWeek", s.sessionsPerWeek());
        jdbc.update("""
                UPDATE client_schedule SET delivery_mode = :mode,
                       session_duration_minutes = :minutes, sessions_per_week = :perWeek
                WHERE client_id = :cid::uuid
                """, p);
    }

    /** Also moves the version: every save does, a slots-only change included. */
    public void replaceDefaults(UUID clientId, PutScheduleRequest req) {
        var p = new HashMap<String, Object>();
        p.put("cid", clientId.toString());
        p.put("perWeek", req.sessionsPerWeek());
        p.put("minutes", req.sessionDurationMinutes());
        p.put("mode", req.deliveryMode());
        jdbc.update("""
                UPDATE client_schedule SET sessions_per_week = :perWeek, session_duration_minutes = :minutes,
                       delivery_mode = :mode, updated_at = now()
                WHERE client_id = :cid::uuid
                """, p);
    }

    // ── slots ──────────────────────────────────────────────────────────────────

    public List<LiveSlot> liveSlots(UUID clientId) {
        return jdbc.query("""
                SELECT id::text AS id, weekday, start_time, program_day, duration_minutes, delivery_mode
                FROM client_schedule_slot WHERE client_id = :cid::uuid AND deleted_at IS NULL
                """, Map.of("cid", clientId.toString()), (rs, i) -> new LiveSlot(rs.getString("id"),
                rs.getInt("weekday"), rs.getTime("start_time").toLocalTime(), intOrNull(rs, "program_day"),
                intOrNull(rs, "duration_minutes"), rs.getString("delivery_mode")));
    }

    public void insertSlot(UUID clientId, PutScheduleRequest.Slot s) {
        var p = slotParams(s);
        p.put("cid", clientId.toString());
        p.put("weekday", s.weekday());
        p.put("start", s.start().toString());
        jdbc.update("""
                INSERT INTO client_schedule_slot (client_id, weekday, start_time, program_day, duration_minutes, delivery_mode)
                VALUES (:cid::uuid, :weekday, CAST(:start AS time), :day, :slotMinutes, :slotMode)
                """, p);
    }

    public void updateSlot(String slotId, PutScheduleRequest.Slot s) {
        var p = slotParams(s);
        p.put("sid", slotId);
        jdbc.update("""
                UPDATE client_schedule_slot SET program_day = :day, duration_minutes = :slotMinutes,
                       delivery_mode = :slotMode
                WHERE id = :sid::uuid
                """, p);
    }

    public void deleteSlots(List<String> slotIds) {
        jdbc.update("UPDATE client_schedule_slot SET deleted_at = now() WHERE id = ANY(CAST(:removed AS uuid[]))",
                Map.of("removed", slotIds.toArray(String[]::new)));
    }

    /**
     * Un-started future bookings of slots that are gone. A session moved by hand
     * has no slot_id, so it is left where the trainer put it.
     */
    public int cancelSessionsOfSlots(List<String> slotIds) {
        return jdbc.update("""
                UPDATE scheduled_session SET status = 'cancelled', cancel_reason = 'schedule_changed'
                WHERE slot_id = ANY(CAST(:removed AS uuid[])) AND status = 'scheduled'
                  AND started_at IS NULL AND scheduled_at > now() AND deleted_at IS NULL
                """, Map.of("removed", slotIds.toArray(String[]::new)));
    }

    /** A changed length, mode or program day moves the slots' future bookings with them. Returns the moved ids. */
    public List<String> moveSessionsOfSlots(List<String> slotIds) {
        return jdbc.queryForList("""
                UPDATE scheduled_session s
                SET duration_minutes = coalesce(sl.duration_minutes, cs.session_duration_minutes, s.duration_minutes),
                    delivery_mode = sl.delivery_mode
                FROM client_schedule_slot sl JOIN client_schedule cs ON cs.client_id = sl.client_id
                WHERE sl.id = s.slot_id AND s.slot_id = ANY(CAST(:changed AS uuid[])) AND s.status = 'scheduled'
                  AND s.started_at IS NULL AND s.scheduled_at > now() AND s.deleted_at IS NULL
                RETURNING s.id::text
                """, Map.of("changed", slotIds.toArray(String[]::new)), String.class);
    }

    /** A batch is legal, so a shared time is a warning. Scoped to this trainer's roster. */
    public List<ScheduleSaved.Clash> clashes(UUID trainerId, UUID clientId) {
        return jdbc.query("""
                SELECT mine.weekday, to_char(mine.start_time, 'HH24:MI') AS start_hm, c.name
                FROM client_schedule_slot mine
                JOIN client_schedule_slot other ON other.weekday = mine.weekday AND other.start_time = mine.start_time
                     AND other.client_id <> mine.client_id AND other.deleted_at IS NULL
                JOIN client c ON c.id = other.client_id AND c.trainer_id = :tid::uuid AND c.deleted_at IS NULL
                     AND c.status <> 'archived'
                WHERE mine.client_id = :cid::uuid AND mine.deleted_at IS NULL
                ORDER BY mine.weekday, mine.start_time, c.name
                """, params(trainerId, clientId),
                (rs, i) -> new ScheduleSaved.Clash(rs.getInt("weekday"), rs.getString("start_hm"), rs.getString("name")));
    }

    // ── sessions ───────────────────────────────────────────────────────────────

    /**
     * Book the client's slots from {@code from} through {@code to} in one
     * INSERT … SELECT. Each slot starts after the latest session it ever made, in
     * any status, deleted included — see {@link ClientScheduleService}. Returns
     * the ids it made.
     */
    public List<String> book(UUID trainerId, UUID clientId, LocalDate from, LocalDate to, ZoneId zone) {
        var p = params(trainerId, clientId);
        p.put("tz", zone.getId());
        p.put("from", Date.valueOf(from));
        p.put("to", Date.valueOf(to));
        return jdbc.queryForList("""
                WITH s AS (
                    SELECT sl.id, sl.weekday, sl.start_time, sl.delivery_mode,
                           coalesce(sl.duration_minutes, cs.session_duration_minutes, 60) AS minutes,
                           (SELECT max((x.scheduled_at AT TIME ZONE :tz)::date)
                            FROM scheduled_session x WHERE x.slot_id = sl.id) AS last_day
                    FROM client_schedule_slot sl JOIN client_schedule cs ON cs.client_id = sl.client_id
                    WHERE sl.client_id = :cid::uuid AND sl.deleted_at IS NULL
                ),
                d AS (
                    SELECT s.*, ((g::date + s.start_time) AT TIME ZONE :tz) AS at
                    FROM s, generate_series(greatest(CAST(:from AS date), coalesce(s.last_day + 1, CAST(:from AS date)))::timestamp,
                                            CAST(:to AS date)::timestamp, interval '1 day') g
                    WHERE extract(isodow FROM g) = s.weekday
                )
                INSERT INTO scheduled_session (trainer_id, client_id, slot_id, scheduled_at, duration_minutes, ends_at, delivery_mode)
                SELECT :tid::uuid, :cid::uuid, d.id, d.at, d.minutes, d.at, d.delivery_mode
                FROM d WHERE d.at > now()
                ON CONFLICT (client_id, scheduled_at) WHERE deleted_at IS NULL AND status <> 'cancelled' DO NOTHING
                RETURNING id::text
                """, p, String.class);
    }

    /**
     * Point sessions at the active program's workouts: a slot with a programDay
     * books that day of the week the date falls in (R45); anything else takes the
     * next workout in sequence after the last one this client was booked into.
     * One UPDATE … FROM. Past the plan's last week, or with no plan, a session is
     * unplanned.
     *
     * <p>ponytail: the sequence counts from the latest earlier session outside
     * {@code ids}, so linking sessions that interleave with already-linked ones
     * numbers the new ones only. Fine for its callers (a fresh booking, a fresh plan).
     */
    public int linkWorkouts(UUID clientId, List<String> ids, ZoneId zone) {
        var p = new HashMap<String, Object>();
        p.put("cid", clientId.toString());
        p.put("ids", ids.toArray(String[]::new));
        p.put("tz", zone.getId());
        return jdbc.update("""
                WITH prog AS (
                    SELECT id, coalesce(start_date, (created_at AT TIME ZONE :tz)::date) AS start
                    FROM program WHERE client_id = :cid::uuid AND status = 'active' AND deleted_at IS NULL
                ),
                plan AS (
                    SELECT w.id, row_number() OVER (ORDER BY w.week, w.day, w.position, w.id) AS n
                    FROM workout w JOIN prog ON w.program_id = prog.id WHERE w.deleted_at IS NULL
                ),
                t AS (
                    SELECT s.id, s.scheduled_at, sl.program_day, (s.scheduled_at AT TIME ZONE :tz)::date AS day
                    FROM scheduled_session s LEFT JOIN client_schedule_slot sl ON sl.id = s.slot_id
                    WHERE s.id = ANY(CAST(:ids AS uuid[]))
                ),
                prior AS (
                    SELECT coalesce((
                        SELECT plan.n FROM scheduled_session x JOIN plan ON plan.id = x.workout_id
                        WHERE x.client_id = :cid::uuid AND x.deleted_at IS NULL AND x.status <> 'cancelled'
                          AND x.scheduled_at < (SELECT min(scheduled_at) FROM t)
                          AND NOT (x.id = ANY(CAST(:ids AS uuid[])))
                        ORDER BY x.scheduled_at DESC LIMIT 1), 0) AS n
                ),
                seq AS (
                    SELECT t.id, row_number() OVER (ORDER BY t.scheduled_at, t.id) + (SELECT n FROM prior) AS n
                    FROM t WHERE t.program_day IS NULL
                ),
                pick AS (
                    SELECT t.id, (SELECT w.id FROM workout w, prog
                                  WHERE w.program_id = prog.id AND w.deleted_at IS NULL AND w.day = t.program_day
                                    AND w.week = greatest(1, (t.day - prog.start) / 7 + 1)
                                  ORDER BY w.position, w.id LIMIT 1) AS wid
                    FROM t WHERE t.program_day IS NOT NULL
                    UNION ALL
                    SELECT seq.id, plan.id FROM seq LEFT JOIN plan ON plan.n = seq.n
                )
                UPDATE scheduled_session s SET workout_id = pick.wid
                FROM pick WHERE s.id = pick.id AND s.workout_id IS DISTINCT FROM pick.wid
                """, p);
    }

    /** Un-started future sessions of this client. */
    public List<String> futureOpen(UUID clientId) {
        return jdbc.queryForList("""
                SELECT id::text FROM scheduled_session
                WHERE client_id = :cid::uuid AND status = 'scheduled' AND started_at IS NULL
                  AND scheduled_at > now() AND deleted_at IS NULL
                """, Map.of("cid", clientId.toString()), String.class);
    }

    /**
     * Cancel the un-started future sessions from now until the start of
     * {@code until} in the workspace's zone — or all of them when {@code until}
     * is null — marked with {@code reason} so the undoing verb brings back
     * exactly these (R70).
     */
    public int cancelUpcoming(UUID clientId, String reason, LocalDate until, ZoneId zone) {
        return jdbc.update("""
                UPDATE scheduled_session SET status = 'cancelled', cancel_reason = :reason
                WHERE client_id = :cid::uuid AND status = 'scheduled' AND started_at IS NULL AND deleted_at IS NULL
                  AND scheduled_at > now()
                  AND (CAST(:until AS date) IS NULL OR scheduled_at < (CAST(:until AS date)::timestamp AT TIME ZONE :tz))
                """, window(clientId, reason, until, zone));
    }

    /**
     * Put back the future sessions this client's own verb cancelled — those from
     * the start of {@code from} on, or every future one when {@code from} is
     * null — where the start is still free: a time taken since stays cancelled
     * rather than double-booking the client.
     */
    public int restoreUpcoming(UUID clientId, String reason, LocalDate from, ZoneId zone) {
        return jdbc.update("""
                UPDATE scheduled_session s SET status = 'scheduled', cancel_reason = NULL
                WHERE s.client_id = :cid::uuid AND s.status = 'cancelled' AND s.cancel_reason = :reason
                  AND s.deleted_at IS NULL AND s.scheduled_at > now()
                  AND (CAST(:until AS date) IS NULL OR s.scheduled_at >= (CAST(:until AS date)::timestamp AT TIME ZONE :tz))
                  AND NOT EXISTS (SELECT 1 FROM scheduled_session o
                                  WHERE o.client_id = s.client_id AND o.scheduled_at = s.scheduled_at
                                    AND o.id <> s.id AND o.deleted_at IS NULL AND o.status <> 'cancelled')
                """, window(clientId, reason, from, zone));
    }

    // ── helpers ────────────────────────────────────────────────────────────────

    private static Map<String, Object> slotParams(PutScheduleRequest.Slot s) {
        var p = new HashMap<String, Object>();
        p.put("day", s.programDay());
        p.put("slotMinutes", s.durationMinutes());
        p.put("slotMode", s.deliveryMode());
        return p;
    }

    private static Map<String, Object> window(UUID clientId, String reason, LocalDate day, ZoneId zone) {
        var p = new HashMap<String, Object>();
        p.put("cid", clientId.toString());
        p.put("reason", reason);
        p.put("until", day == null ? null : Date.valueOf(day));
        p.put("tz", zone.getId());
        return p;
    }
}
