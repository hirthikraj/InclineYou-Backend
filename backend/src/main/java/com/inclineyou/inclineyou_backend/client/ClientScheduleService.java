package com.inclineyou.inclineyou_backend.client;

import com.inclineyou.inclineyou_backend.exception.ApiException;
import com.inclineyou.inclineyou_backend.tenant.WorkspaceClock;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * {@code PUT /v1/clients/{id}/schedule} (api-contract Clients A8) and the one
 * booking rule every Clients verb shares (R21): the weekly slots book sessions
 * through a rolling 28 days.
 *
 * <p><b>How a slot knows what it has booked.</b> Each slot books forward from the
 * latest session it ever made, in any status, deleted included. So re-sending
 * the same week books nothing, and a cancelled, taken-back or paused session
 * never comes back on its own. The contract's per-(slot, date) wording could not
 * keep that promise for a session moved by hand: a move clears {@code slot_id},
 * so its date would look empty and be booked twice.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ClientScheduleService {

    private final NamedParameterJdbcTemplate jdbc;
    private final WorkspaceClock clock;
    private final ClientSummaryService summaries;

    static final int WINDOW_DAYS = 28;
    private static final Set<String> KEYS =
            Set.of("sessionsPerWeek", "sessionDurationMinutes", "deliveryMode", "slots", "bookFrom");
    private static final Set<String> SLOT_KEYS = Set.of("weekday", "start", "programDay", "durationMinutes", "deliveryMode");
    private static final Set<String> MODES = Set.of("floor", "home_visit", "remote");

    public record Schedule(Integer sessionsPerWeek, Integer sessionDurationMinutes, String deliveryMode, String version) {}
    public record Clash(int weekday, String start, String clientName) {}
    public record Saved(Schedule schedule, List<ClientSummaryService.Slot> slots, int booked, int cancelled,
                        List<Clash> clashes) {}

    private record SlotIn(int weekday, LocalTime start, Integer programDay, Integer durationMinutes, String deliveryMode) {}

    @Transactional
    @SuppressWarnings("unchecked")
    public Saved put(UUID trainerId, UUID clientId, String ifMatch, Map<String, Object> body) {
        if (ifMatch == null || ifMatch.isBlank()) {
            throw new ApiException(HttpStatus.PRECONDITION_REQUIRED, "PRECONDITION_REQUIRED",
                    "Send If-Match with the schedule's version.");
        }
        if (body == null) throw ApiException.validation("body: required");
        for (String key : body.keySet()) if (!KEYS.contains(key)) throw ClientWriteService.unknown(key);
        Integer perWeek = ClientWriteService.whole(body.get("sessionsPerWeek"), 0, 14, "sessionsPerWeek");
        Integer minutes = ClientWriteService.whole(body.get("sessionDurationMinutes"), 1, 480, "sessionDurationMinutes");
        String mode = mode(body.get("deliveryMode"), "deliveryMode");
        if (!(body.get("slots") instanceof List<?> rawSlots)) throw ApiException.validation("slots: a list, required");
        var slots = new ArrayList<SlotIn>();
        var seen = new HashSet<String>();
        for (Object o : rawSlots) {
            if (!(o instanceof Map<?, ?> m)) throw ApiException.validation("slots: each an object");
            var s = (Map<String, Object>) m;
            for (String key : s.keySet()) if (!SLOT_KEYS.contains(key)) throw ClientWriteService.unknown("slots." + key);
            Integer weekday = ClientWriteService.whole(s.get("weekday"), 1, 7, "slots.weekday");
            if (weekday == null) throw ApiException.validation("slots.weekday: required");
            LocalTime start = time(s.get("start"));
            if (!seen.add(weekday + "@" + start)) throw ApiException.validation("slots: the same weekday and start twice");
            slots.add(new SlotIn(weekday, start,
                    ClientWriteService.whole(s.get("programDay"), 1, 7, "slots.programDay"),
                    ClientWriteService.whole(s.get("durationMinutes"), 1, 480, "slots.durationMinutes"),
                    mode(s.get("deliveryMode"), "slots.deliveryMode")));
        }
        LocalDate bookFrom = body.get("bookFrom") instanceof String f ? WorkspaceClock.parseDate(f, "bookFrom") : null;
        if (body.get("bookFrom") != null && !(body.get("bookFrom") instanceof String)) {
            throw ApiException.validation("bookFrom: yyyy-MM-dd");
        }

        var p = params(trainerId, clientId);
        var client = lockClient(p);
        if ("archived".equals(client.get("status"))) throw archived();
        String version = String.valueOf(((Timestamp) client.get("schedule_updated_at")).getTime());
        String want = ifMatch.strip().replaceFirst("^W/", "").replace("\"", "");
        if (!"*".equals(want) && !want.equals(version)) {
            throw new ApiException(HttpStatus.PRECONDITION_FAILED, "PRECONDITION_FAILED",
                    "This week was changed in another tab since it loaded.");
        }
        if (client.get("program_days") instanceof Number days) {
            for (var s : slots) {
                if (s.programDay() != null && s.programDay() > days.intValue()) {
                    throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "PROGRAM_DAY_OUT_OF_RANGE",
                            "Their program has " + days + " days a week; programDay " + s.programDay() + " is past that.");
                }
            }
        }

        // The whole resource: PUT replaces, so an absent field is a cleared one.
        p.put("perWeek", perWeek);
        p.put("minutes", minutes);
        p.put("mode", mode);
        jdbc.update("""
                UPDATE client_schedule SET sessions_per_week = :perWeek, session_duration_minutes = :minutes,
                       delivery_mode = :mode
                WHERE client_id = :cid::uuid
                """, p);

        // Diff the slot set on (weekday, start), the live key: kept slots keep their id.
        var live = jdbc.queryForList("""
                SELECT id::text AS id, weekday, start_time, program_day, duration_minutes, delivery_mode
                FROM client_schedule_slot WHERE client_id = :cid::uuid AND deleted_at IS NULL
                """, p);
        var liveByKey = new HashMap<String, Map<String, Object>>();
        for (var l : live) liveByKey.put(l.get("weekday") + "@" + ((java.sql.Time) l.get("start_time")).toLocalTime(), l);
        var removed = new ArrayList<String>();
        var changed = new ArrayList<String>();
        for (var s : slots) {
            var existing = liveByKey.remove(s.weekday() + "@" + s.start());
            var sp = new HashMap<String, Object>(p);
            sp.put("weekday", s.weekday());
            sp.put("start", s.start().toString());
            sp.put("day", s.programDay());
            sp.put("slotMinutes", s.durationMinutes());
            sp.put("slotMode", s.deliveryMode());
            if (existing == null) {
                jdbc.update("""
                        INSERT INTO client_schedule_slot (client_id, weekday, start_time, program_day, duration_minutes, delivery_mode)
                        VALUES (:cid::uuid, :weekday, CAST(:start AS time), :day, :slotMinutes, :slotMode)
                        """, sp);
            } else if (!java.util.Objects.equals(num(existing.get("program_day")), s.programDay())
                    || !java.util.Objects.equals(num(existing.get("duration_minutes")), s.durationMinutes())
                    || !java.util.Objects.equals(existing.get("delivery_mode"), s.deliveryMode())) {
                sp.put("sid", existing.get("id"));
                jdbc.update("""
                        UPDATE client_schedule_slot SET program_day = :day, duration_minutes = :slotMinutes,
                               delivery_mode = :slotMode
                        WHERE id = :sid::uuid
                        """, sp);
                changed.add((String) existing.get("id"));
            }
        }
        for (var gone : liveByKey.values()) removed.add((String) gone.get("id"));

        int cancelled = 0;
        if (!removed.isEmpty()) {
            p.put("removed", removed.toArray(String[]::new));
            jdbc.update("UPDATE client_schedule_slot SET deleted_at = now() WHERE id = ANY(CAST(:removed AS uuid[]))", p);
            // Un-started future bookings of a slot that is gone. A session moved by
            // hand has no slot_id, so it is left where the trainer put it.
            cancelled = jdbc.update("""
                    UPDATE scheduled_session SET status = 'cancelled', cancel_reason = 'schedule_changed'
                    WHERE slot_id = ANY(CAST(:removed AS uuid[])) AND status = 'scheduled'
                      AND started_at IS NULL AND scheduled_at > now() AND deleted_at IS NULL
                    """, p);
        }
        var relink = new ArrayList<String>();
        if (!changed.isEmpty()) {
            // A changed length, mode or program day moves the slot's future bookings with it.
            p.put("changed", changed.toArray(String[]::new));
            relink.addAll(jdbc.queryForList("""
                    UPDATE scheduled_session s
                    SET duration_minutes = coalesce(sl.duration_minutes, cs.session_duration_minutes, s.duration_minutes),
                        delivery_mode = sl.delivery_mode
                    FROM client_schedule_slot sl JOIN client_schedule cs ON cs.client_id = sl.client_id
                    WHERE sl.id = s.slot_id AND s.slot_id = ANY(CAST(:changed AS uuid[])) AND s.status = 'scheduled'
                      AND s.started_at IS NULL AND s.scheduled_at > now() AND s.deleted_at IS NULL
                    RETURNING s.id::text
                    """, p, String.class));
        }
        // The version moves on every save, a slots-only change included.
        jdbc.update("UPDATE client_schedule SET updated_at = now() WHERE client_id = :cid::uuid", p);

        ZoneId zone = clock.zone();
        LocalDate tomorrow = WorkspaceClock.today(zone).plusDays(1);
        int booked = 0;
        if (bookable(client)) {
            var made = book(trainerId, clientId, bookFrom == null ? tomorrow : bookFrom, zone);
            booked = made.size();
            relink.addAll(made);
        }
        linkWorkouts(clientId, relink, zone);
        log.info("schedule saved trainer={} client={} slots={} booked={} cancelled={}",
                trainerId, clientId, slots.size(), booked, cancelled);

        var summary = summaries.one(trainerId, clientId).orElseThrow();
        var s = summary.schedule();
        return new Saved(new Schedule(s.sessionsPerWeek(), s.sessionDurationMinutes(), s.deliveryMode(), s.version()),
                summary.slots(), booked, cancelled, clashes(p));
    }

    /**
     * Book the client's slots from {@code from} through today + 28 in one
     * INSERT … SELECT. Each slot starts after the latest session it ever made
     * (see the class note). Returns the ids it made; the caller links workouts.
     */
    public List<String> book(UUID trainerId, UUID clientId, LocalDate from, ZoneId zone) {
        var p = params(trainerId, clientId);
        p.put("tz", zone.getId());
        p.put("from", Date.valueOf(from));
        p.put("to", Date.valueOf(WorkspaceClock.today(zone).plusDays(WINDOW_DAYS)));
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
        if (ids.isEmpty()) return 0;
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

    /** Un-started future sessions of this client, for a relink after a new plan. */
    public List<String> futureOpen(UUID clientId) {
        return jdbc.queryForList("""
                SELECT id::text FROM scheduled_session
                WHERE client_id = :cid::uuid AND status = 'scheduled' AND started_at IS NULL
                  AND scheduled_at > now() AND deleted_at IS NULL
                """, Map.of("cid", clientId.toString()), String.class);
    }

    /** Slot booking skips a paused client and one whose membership is removed (R21, CLIENT_NOT_BOOKABLE). */
    static boolean bookable(Map<String, Object> client) {
        Object status = client.get("status");
        return ("active".equals(status) || "inactive".equals(status))
                && !"removed".equals(client.get("membership_status"));
    }

    /** A batch is legal, so a shared time is a warning. Scoped to this trainer's roster. */
    private List<Clash> clashes(Map<String, Object> p) {
        return jdbc.query("""
                SELECT mine.weekday, to_char(mine.start_time, 'HH24:MI') AS start_hm, c.name
                FROM client_schedule_slot mine
                JOIN client_schedule_slot other ON other.weekday = mine.weekday AND other.start_time = mine.start_time
                     AND other.client_id <> mine.client_id AND other.deleted_at IS NULL
                JOIN client c ON c.id = other.client_id AND c.trainer_id = :tid::uuid AND c.deleted_at IS NULL
                     AND c.status <> 'archived'
                WHERE mine.client_id = :cid::uuid AND mine.deleted_at IS NULL
                ORDER BY mine.weekday, mine.start_time, c.name
                """, p, (rs, i) -> new Clash(rs.getInt("weekday"), rs.getString("start_hm"), rs.getString("name")));
    }

    /** The client locked, with what every Clients verb decides on. 404 when not this trainer's. */
    Map<String, Object> lockClient(Map<String, Object> p) {
        var rows = jdbc.queryForList("""
                SELECT c.status, c.membership_status, c.paused_at, c.paused_until, cs.updated_at AS schedule_updated_at,
                       (SELECT pr.days FROM program pr WHERE pr.client_id = c.id AND pr.status = 'active'
                          AND pr.deleted_at IS NULL) AS program_days
                FROM client c JOIN client_schedule cs ON cs.client_id = c.id
                WHERE c.id = :cid::uuid AND c.trainer_id = :tid::uuid AND c.deleted_at IS NULL
                FOR UPDATE OF c
                """, p);
        if (rows.isEmpty()) throw ApiException.notFound("That client is not on your roster.");
        return rows.getFirst();
    }

    static ApiException archived() {
        return ApiException.conflict("CLIENT_ARCHIVED", "This client is archived. Unarchive them first.");
    }

    static Map<String, Object> params(UUID trainerId, UUID clientId) {
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("cid", clientId.toString());
        return p;
    }

    private static String mode(Object raw, String field) {
        if (raw == null) return null;
        if (!(raw instanceof String m) || !MODES.contains(m)) throw ApiException.validation(field + ": floor, home_visit or remote");
        return m;
    }

    private static LocalTime time(Object raw) {
        if (!(raw instanceof String s)) throw ApiException.validation("slots.start: HH:mm, required");
        try {
            return LocalTime.parse(s.strip());
        } catch (DateTimeParseException e) {
            throw ApiException.validation("slots.start: HH:mm");
        }
    }

    private static Integer num(Object v) {
        return v instanceof Number n ? n.intValue() : null;
    }
}
