package com.inclineyou.inclineyou_backend.program;

import com.inclineyou.inclineyou_backend.client.ClientScheduleService;
import com.inclineyou.inclineyou_backend.exception.ApiException;
import com.inclineyou.inclineyou_backend.tenant.WorkspaceClock;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Date;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * The add flow's step 4 on the v1 schema: {@code GET /v1/programs?kind=template}
 * and {@code POST /v1/programs/{templateId}/apply} (api-contract Clients, Programs
 * A5). A template is a program with {@code client_id IS NULL}.
 *
 * <p>ponytail: this is the add flow's slice of Programs, not Programs. The list
 * is the step-4 shape (no counts, no assignedClients) and apply copies the tree
 * as it stands; the full Programs L1 and the builder come with the Programs pass.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ProgramTemplateService {

    private final NamedParameterJdbcTemplate jdbc;
    private final WorkspaceClock clock;
    private final ClientScheduleService schedules;

    private static final Set<String> APPLY_KEYS = Set.of("id", "clientId", "name", "goal", "startDate", "endDate");
    private static final Set<String> GOALS = Set.of("weight_loss", "strength", "muscle_gain", "rehab", "general");

    public record Library(String level, String equipment, String summary) {}

    public record Template(String id, String origin, String name, String goal, String description,
                           int weeks, int days, List<String> workouts, Library library) {}

    public record Plan(String id, String clientId, String name, String goal, int weeks, int days, String status,
                       String startDate, String endDate, String copiedFromProgramId, String version,
                       Integer linkedSessions) {}

    public record Applied(Plan plan, boolean created) {}

    /** The trainer's own templates, newest edit first, then the InclineYou library. Bounded. */
    public List<Template> templates(UUID trainerId) {
        var p = Map.of("tid", trainerId.toString());
        var names = new HashMap<String, List<String>>();
        jdbc.query("""
                SELECT w.program_id::text AS pid, w.name FROM workout w JOIN program pr ON pr.id = w.program_id
                WHERE pr.client_id IS NULL AND pr.deleted_at IS NULL AND w.deleted_at IS NULL AND w.week = 1
                  AND (pr.trainer_id = :tid::uuid OR pr.origin = 'inclineyou')
                ORDER BY w.day, w.position, w.id
                """, p, rs -> {
            names.computeIfAbsent(rs.getString("pid"), k -> new ArrayList<>()).add(rs.getString("name"));
        });
        return jdbc.query("""
                SELECT pr.id::text AS id, pr.origin, pr.name, pr.goal, pr.description, pr.weeks, pr.days,
                       cp.level, cp.equipment, cp.summary
                FROM program pr LEFT JOIN certified_program cp ON cp.program_id = pr.id
                WHERE pr.client_id IS NULL AND pr.deleted_at IS NULL
                  AND (pr.trainer_id = :tid::uuid OR pr.origin = 'inclineyou')
                ORDER BY (pr.origin = 'inclineyou'), pr.updated_at DESC, pr.id
                """, p, (rs, i) -> new Template(
                rs.getString("id"), rs.getString("origin"), rs.getString("name"), rs.getString("goal"),
                rs.getString("description"), rs.getInt("weeks"), rs.getInt("days"),
                names.getOrDefault(rs.getString("id"), List.of()),
                rs.getString("level") == null ? null
                        : new Library(rs.getString("level"), rs.getString("equipment"), rs.getString("summary"))));
    }

    /**
     * Deep-copy a template into a client plan, complete any plan already active
     * (R50: replaced, never refused), and link the client's booked future
     * sessions to the new plan's workouts. The week is not touched: step 3's
     * {@code PUT /schedule} is its one write path.
     */
    @Transactional
    public Applied apply(UUID trainerId, UUID templateId, Map<String, Object> body) {
        if (body == null) throw ApiException.validation("body: required");
        for (String key : body.keySet()) {
            if (!APPLY_KEYS.contains(key)) throw ApiException.validation(key + ": not a field this route takes");
        }
        UUID id = uuid(body.get("id"), "id");
        UUID clientId = uuid(body.get("clientId"), "clientId");
        if (clientId == null) throw ApiException.validation("clientId: required");
        Object name = body.get("name");
        if (name != null && (!(name instanceof String n) || n.isBlank() || n.length() > 150)) {
            throw ApiException.validation("name: text, at most 150 characters");
        }
        Object goal = body.get("goal");
        if (goal != null && !(goal instanceof String g && GOALS.contains(g))) {
            throw ApiException.validation("goal: weight_loss, strength, muscle_gain, rehab or general");
        }
        LocalDate start = date(body.get("startDate"), "startDate");
        LocalDate end = date(body.get("endDate"), "endDate");

        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("cid", clientId.toString());
        p.put("src", templateId.toString());
        var sources = jdbc.queryForList("""
                SELECT client_id, name, goal, description, weeks, days FROM program
                WHERE id = :src::uuid AND deleted_at IS NULL AND (trainer_id = :tid::uuid OR origin = 'inclineyou')
                """, p);
        if (sources.isEmpty()) throw ApiException.notFound("That program is not yours.");
        var src = sources.getFirst();
        if (src.get("client_id") != null) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "PROGRAM_NOT_TEMPLATE",
                    "That is a client's plan. Copy it into a template first.");
        }
        var clients = jdbc.queryForList("""
                SELECT status FROM client WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                FOR UPDATE
                """, p);
        if (clients.isEmpty()) throw ApiException.notFound("That client is not on your roster.");
        if (id != null) {
            p.put("id", id.toString());
            var owner = jdbc.queryForList("""
                    SELECT (trainer_id = :tid::uuid AND client_id = :cid::uuid) AS mine FROM program WHERE id = :id::uuid
                    """, p);
            if (!owner.isEmpty()) {
                if (!Boolean.TRUE.equals(owner.getFirst().get("mine"))) throw ApiException.idConflict();
                return new Applied(plan(p, null), false);
            }
        }
        if ("archived".equals(clients.getFirst().get("status"))) {
            throw ApiException.conflict("CLIENT_ARCHIVED", "This client is archived. Unarchive them first.");
        }

        ZoneId zone = clock.zone();
        LocalDate from = start != null ? start : WorkspaceClock.today(zone);
        int weeks = ((Number) src.get("weeks")).intValue();
        LocalDate to = end != null ? end : from.plusDays(weeks * 7L - 1);
        if (to.isBefore(from)) throw ApiException.validation("endDate: before startDate");

        p.put("id", (id == null ? UUID.randomUUID() : id).toString());
        p.put("name", name != null ? ((String) name).strip() : src.get("name"));
        p.put("goal", goal != null ? goal : src.get("goal"));
        p.put("start", Date.valueOf(from));
        p.put("end", Date.valueOf(to));
        jdbc.update("""
                UPDATE program SET status = 'completed'
                WHERE client_id = :cid::uuid AND status = 'active' AND deleted_at IS NULL
                """, p);
        jdbc.update("""
                INSERT INTO program (id, origin, trainer_id, client_id, name, goal, description, weeks, days, status,
                                     start_date, end_date, copied_from_program_id, synced_at)
                SELECT :id::uuid, 'trainer', :tid::uuid, :cid::uuid, :name, :goal, description, weeks, days, 'active',
                       :start, :end, id, now()
                FROM program WHERE id = :src::uuid
                """, p);
        // The tree in one statement. Volatile ids in a CTE are materialised once,
        // so every reference to e.new is the same id; the FKs are checked at the end.
        jdbc.update("""
                WITH w AS (
                    SELECT id AS old, gen_random_uuid() AS new, week, day, position, name, notes
                    FROM workout WHERE program_id = :src::uuid AND deleted_at IS NULL
                ),
                wi AS (
                    INSERT INTO workout (id, origin, trainer_id, program_id, week, day, position, name, notes, copied_from_workout_id)
                    SELECT w.new, 'trainer', :tid::uuid, :id::uuid, w.week, w.day, w.position, w.name, w.notes, w.old FROM w
                ),
                e AS (
                    SELECT we.id AS old, gen_random_uuid() AS new, we.workout_id, we.exercise_id, we.position,
                           we.alternative_of, we.group_id, we.section, we.notes
                    FROM workout_exercise we JOIN w ON w.old = we.workout_id
                ),
                ei AS (
                    INSERT INTO workout_exercise (id, workout_id, exercise_id, position, alternative_of, group_id, section, notes)
                    SELECT e.new, w.new, e.exercise_id, e.position, alt.new, e.group_id, e.section, e.notes
                    FROM e JOIN w ON w.old = e.workout_id LEFT JOIN e alt ON alt.old = e.alternative_of
                )
                INSERT INTO workout_set (workout_exercise_id, position, load_kind, load_value, effort_kind, effort_value,
                                         rest_seconds, tempo, notes)
                SELECT e.new, s.position, s.load_kind, s.load_value, s.effort_kind, s.effort_value, s.rest_seconds,
                       s.tempo, s.notes
                FROM workout_set s JOIN e ON e.old = s.workout_exercise_id
                """, p);
        int linked = schedules.linkWorkouts(clientId, schedules.futureOpen(clientId), zone);
        log.info("program applied trainer={} client={} template={} plan={} linked={}",
                trainerId, clientId, templateId, p.get("id"), linked);
        return new Applied(plan(p, linked), true);
    }

    public record Progress(int sessionsDone, int sessionsPlanned, Integer currentWeek) {}

    public record ClientProgram(String id, String name, String goal, int weeks, int days, String status,
                                String startDate, String endDate, String copiedFromProgramId, long revisedAt,
                                Progress progress) {}

    /**
     * {@code GET /v1/programs?clientId=} — api-contract 1.1 Client file. The
     * client's plans, the active one first, then the rest newest first. Bounded.
     *
     * <p>{@code sessionsDone} counts done sessions whose workout belongs to the
     * plan, in one grouped count over idx_scheduled_session_workout for all of
     * them; {@code sessionsPlanned} is the plan's workouts. {@code currentWeek}
     * is where today falls from the start, held inside the plan's weeks, and null
     * without a start date.
     */
    public List<ClientProgram> forClient(UUID trainerId, UUID clientId) {
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("cid", clientId.toString());
        Boolean mine = jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM client WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)
                """, p, Boolean.class);
        if (!Boolean.TRUE.equals(mine)) throw ApiException.notFound("That client is not on your roster.");
        LocalDate today = WorkspaceClock.today(clock.zone());
        return jdbc.query("""
                WITH mine AS (
                    SELECT * FROM program WHERE client_id = :cid::uuid AND deleted_at IS NULL
                ),
                planned AS (
                    SELECT w.program_id, count(*) AS planned FROM workout w
                    WHERE w.program_id IN (SELECT id FROM mine) AND w.deleted_at IS NULL GROUP BY w.program_id
                ),
                done AS (
                    SELECT w.program_id, count(*) AS done FROM scheduled_session s
                    JOIN workout w ON w.id = s.workout_id
                    WHERE w.program_id IN (SELECT id FROM mine) AND s.status = 'done' AND s.deleted_at IS NULL
                    GROUP BY w.program_id
                )
                SELECT m.id::text AS id, m.name, m.goal, m.weeks, m.days, m.status,
                       m.start_date, m.end_date::text AS end_date,
                       m.copied_from_program_id::text AS copied_from, m.revised_at,
                       coalesce(d.done, 0) AS done, coalesce(pl.planned, 0) AS planned
                FROM mine m
                LEFT JOIN planned pl ON pl.program_id = m.id
                LEFT JOIN done d ON d.program_id = m.id
                ORDER BY (m.status = 'active') DESC, m.start_date DESC NULLS LAST, m.created_at DESC, m.id
                """, p, (rs, i) -> {
            var start = rs.getDate("start_date");
            int weeks = rs.getInt("weeks");
            Integer week = start == null ? null : (int) Math.min(weeks, Math.max(1,
                    (today.toEpochDay() - start.toLocalDate().toEpochDay()) / 7 + 1));
            return new ClientProgram(rs.getString("id"), rs.getString("name"), rs.getString("goal"), weeks,
                    rs.getInt("days"), rs.getString("status"), start == null ? null : start.toString(),
                    rs.getString("end_date"), rs.getString("copied_from"), rs.getTimestamp("revised_at").getTime(),
                    new Progress(rs.getInt("done"), rs.getInt("planned"), week));
        });
    }

    private Plan plan(Map<String, Object> p, Integer linked) {
        return jdbc.queryForObject("""
                SELECT id::text AS id, client_id::text AS client_id, name, goal, weeks, days, status,
                       start_date::text AS start_date, end_date::text AS end_date,
                       copied_from_program_id::text AS copied_from, revised_at
                FROM program WHERE id = :id::uuid
                """, p, (rs, i) -> new Plan(rs.getString("id"), rs.getString("client_id"), rs.getString("name"),
                rs.getString("goal"), rs.getInt("weeks"), rs.getInt("days"), rs.getString("status"),
                rs.getString("start_date"), rs.getString("end_date"), rs.getString("copied_from"),
                String.valueOf(rs.getTimestamp("revised_at").getTime()), linked));
    }

    private static UUID uuid(Object raw, String field) {
        if (raw == null) return null;
        try {
            return UUID.fromString(String.valueOf(raw).strip());
        } catch (IllegalArgumentException e) {
            throw ApiException.validation(field + ": not an id");
        }
    }

    private static LocalDate date(Object raw, String field) {
        if (raw == null) return null;
        if (!(raw instanceof String s)) throw ApiException.validation(field + ": yyyy-MM-dd");
        return WorkspaceClock.parseDate(s, field);
    }
}
