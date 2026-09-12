package com.inclineyou.inclineyou_backend.team;

import com.inclineyou.inclineyou_backend.push.PushService;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

/**
 * Phase 3: an admin editing a teammate's plan, in place.
 *
 * <h2>The case this exists for</h2>
 *
 * Priya is off sick, her client is standing on the gym floor, and the plan says
 * 5×5 back squat for a shoulder that is not having it. Handing the client over
 * permanently is the wrong answer to a swapped exercise, and "wait for Priya" is
 * not an answer at all. So an owner or admin can edit the live program.
 *
 * <h2>Why every edit is written down</h2>
 *
 * A coach who finds their client's Tuesday different from how they left it, with
 * no way to see who changed it, has been handed a reason to distrust the whole
 * team feature — and a coach's trust is what this product runs on. So every
 * crossing writes a {@code team_activity} row with a sentence in the words the
 * coach will read it in, and {@link #activity} is theirs to read. Editing your
 * own client writes nothing: there is nobody to account to.
 *
 * <h2>What is NOT here, and why</h2>
 *
 * <b>Templates.</b> A teammate's template stays copy-only, and that is not an
 * oversight — it is §3.1 of the PRD. A template two coaches use and one coach
 * edits is a template that changed under the other's clients without either of
 * them touching it. A live program belongs to one client and one coach, which is
 * exactly what makes editing it in place safe to offer.
 *
 * <b>Money, in any form.</b> Nothing in this class touches `package`, `payment`
 * or `gym_settlement`, and no edit path can reach them.
 *
 * <b>Creating or deleting a program.</b> An admin can change a plan; they cannot
 * give a teammate's client a whole new one or take their plan away. Those are
 * handover-shaped decisions, and the handover already exists and is audited.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TeamEditService {

    private final NamedParameterJdbcTemplate jdbc;
    private final TeamScope scope;
    private final PushService push;

    /* ------------------------------------------------------------------ DTOs */

    public record UpdateProgramRequest(
            @Size(max = 150) String name,
            String goal,
            /** 'active' | 'paused' | 'completed' — the same values the owner's own screen sends. */
            String status
    ) {}

    public record ExerciseRequest(
            @NotBlank String exerciseId,
            Integer sets,
            Integer reps,
            /** V25 · a hold rather than a count. Set instead of `reps` on a timed exercise. */
            Integer durationSeconds,
            Integer restSeconds,
            BigDecimal targetLoad,
            String notes,
            Integer dayOfWeek,
            Integer week,
            Integer orderIndex
    ) {}

    public record UpdateExerciseRequest(
            Integer sets,
            Integer reps,
            Integer durationSeconds,
            Integer restSeconds,
            BigDecimal targetLoad,
            String notes,
            Integer dayOfWeek,
            Integer week,
            Integer orderIndex
    ) {}

    /** A team custom exercise — shared in place, so an admin may fix it for everybody. */
    public record UpdateCustomExerciseRequest(
            @Size(max = 150) String name,
            String muscleGroup,
            String equipment,
            String movementPattern,
            String description
    ) {}

    public record ProgramExerciseRow(
            UUID id,
            UUID exerciseId,
            String exerciseName,
            Integer sets,
            Integer reps,
            Integer durationSeconds,
            Integer restSeconds,
            BigDecimal targetLoad,
            String notes,
            Integer dayOfWeek,
            Integer week,
            int orderIndex
    ) {}

    public record TeamProgramDetail(
            UUID id,
            UUID clientId,
            String clientName,
            UUID coachTrainerId,
            String coachName,
            String name,
            String goal,
            String status,
            String startDate,
            String endDate,
            List<ProgramExerciseRow> exercises,
            /** False for the caller's own program — the app should send them to their own editor. */
            boolean teammates
    ) {}

    public record ActivityRow(
            UUID id,
            UUID actorTrainerId, String actorName,
            UUID subjectTrainerId, String subjectName,
            UUID clientId, String clientName,
            String entityType, String action, String summary,
            long createdAt
    ) {}

    /* ------------------------------------------------------------ the program */

    /**
     * A teammate's program, with its exercises. Admin+.
     *
     * The caller's own programs are reachable here too, and answered with
     * {@code teammates = false} rather than refused: the team roster can link
     * straight to a plan without first working out whose it is, and the app sends
     * them to their own offline editor when it is theirs.
     */
    @Transactional(readOnly = true)
    public TeamProgramDetail program(UUID trainerId, UUID programId) {
        var s = scope.resolve(trainerId);
        s.requireAdmin();

        var rows = jdbc.queryForList("""
                SELECT p.id::text         AS id,
                       p.client_id::text  AS client_id,
                       c.name             AS client_name,
                       p.trainer_id::text AS coach_id,
                       t.name             AS coach_name,
                       p.name             AS name,
                       p.goal             AS goal,
                       p.status           AS status,
                       p.start_date::text AS start_date,
                       p.end_date::text   AS end_date
                FROM program p
                JOIN client c  ON c.id = p.client_id
                JOIN trainer t ON t.id = p.trainer_id
                WHERE p.id = :pid::uuid
                  AND p.trainer_id = ANY (CAST(:visible AS uuid[]))
                  AND p.deleted_at IS NULL
                """, Map.of("pid", programId.toString(), "visible", s.visibleTrainerIdArray()));

        if (rows.isEmpty()) throw TeamRuleException.programNotInTeam();
        var row = rows.getFirst();
        String coachId = (String) row.get("coach_id");

        return new TeamProgramDetail(
                programId,
                UUID.fromString((String) row.get("client_id")),
                (String) row.get("client_name"),
                UUID.fromString(coachId),
                (String) row.get("coach_name"),
                (String) row.get("name"),
                (String) row.get("goal"),
                (String) row.get("status"),
                (String) row.get("start_date"),
                (String) row.get("end_date"),
                exercises(programId),
                !trainerId.toString().equals(coachId));
    }

    @Transactional
    public TeamProgramDetail updateProgram(UUID actorId, UUID programId, UpdateProgramRequest req) {
        var target = requireEditable(actorId, programId);

        jdbc.update("""
                UPDATE program SET
                    name       = COALESCE(:name, name),
                    goal       = COALESCE(:goal, goal),
                    status     = COALESCE(:status, status),
                    updated_at = NOW()
                WHERE id = :pid::uuid AND deleted_at IS NULL
                """, params(
                "pid", programId.toString(),
                "name", req.name() == null ? null : req.name().trim(),
                "goal", req.goal(),
                "status", req.status()));

        record(target, actorId, "program", programId, "updated",
                req.status() != null
                        ? "Set %s's plan to %s".formatted(target.clientName, req.status())
                        : "Edited %s's plan".formatted(target.clientName));

        return program(actorId, programId);
    }

    @Transactional
    public ProgramExerciseRow addExercise(UUID actorId, UUID programId, ExerciseRequest req) {
        var target = requireEditable(actorId, programId);

        UUID id = UUID.randomUUID();
        var p = prescription(req.sets(), req.reps(), req.durationSeconds(), req.restSeconds(),
                req.targetLoad(), req.notes(), req.dayOfWeek(), req.week(), req.orderIndex());
        p.put("id", id.toString());
        p.put("pid", programId.toString());
        p.put("eid", req.exerciseId());

        jdbc.update("""
                INSERT INTO program_exercise
                    (id, program_id, exercise_id, sets, reps, duration_seconds, rest_seconds,
                     target_load, notes, day_of_week, week, order_index, created_at, updated_at)
                VALUES (:id::uuid, :pid::uuid, :eid::uuid, :sets, :reps, :durationSeconds,
                        :restSeconds, :targetLoad, :notes, :dayOfWeek, :week,
                        COALESCE(:orderIndex, 0), NOW(), NOW())
                """, p);

        var row = exercise(id);
        record(target, actorId, "program_exercise", id, "added",
                "Added %s to %s's %s".formatted(row.exerciseName(), target.clientName, dayLabel(row)));
        return row;
    }

    @Transactional
    public ProgramExerciseRow updateExercise(UUID actorId, UUID programId, UUID exerciseRowId,
                                             UpdateExerciseRequest req) {
        var target = requireEditable(actorId, programId);
        requireInProgram(programId, exerciseRowId);

        var p = prescription(req.sets(), req.reps(), req.durationSeconds(), req.restSeconds(),
                req.targetLoad(), req.notes(), req.dayOfWeek(), req.week(), req.orderIndex());
        p.put("id", exerciseRowId.toString());

        jdbc.update("""
                UPDATE program_exercise SET
                    sets             = COALESCE(:sets, sets),
                    reps             = COALESCE(:reps, reps),
                    duration_seconds = COALESCE(:durationSeconds, duration_seconds),
                    rest_seconds     = COALESCE(:restSeconds, rest_seconds),
                    target_load      = COALESCE(:targetLoad, target_load),
                    notes            = COALESCE(:notes, notes),
                    day_of_week      = COALESCE(:dayOfWeek, day_of_week),
                    week             = COALESCE(:week, week),
                    order_index      = COALESCE(:orderIndex, order_index),
                    updated_at       = NOW()
                WHERE id = :id::uuid AND deleted_at IS NULL
                """, p);

        var row = exercise(exerciseRowId);
        record(target, actorId, "program_exercise", exerciseRowId, "updated",
                "Changed %s to %s on %s's %s".formatted(
                        row.exerciseName(), prescriptionLine(row), target.clientName, dayLabel(row)));
        return row;
    }

    /**
     * Soft-deleted, like every other removal here, so the tombstone reaches the
     * owning coach's phone. Their pull is unchanged by an edit — the program's
     * `trainer_id` never moved — so `updated_at` and `deleted_at` are all it
     * takes for the change to land on the device of the person whose plan it is.
     */
    @Transactional
    public void removeExercise(UUID actorId, UUID programId, UUID exerciseRowId) {
        var target = requireEditable(actorId, programId);
        var row = requireInProgram(programId, exerciseRowId);

        jdbc.update("""
                UPDATE program_exercise SET deleted_at = NOW(), updated_at = NOW()
                WHERE id = :id::uuid AND deleted_at IS NULL
                """, Map.of("id", exerciseRowId.toString()));

        record(target, actorId, "program_exercise", exerciseRowId, "removed",
                "Removed %s from %s's %s".formatted(
                        row.exerciseName(), target.clientName, dayLabel(row)));
    }

    /* --------------------------------------------------- the shared exercise */

    /**
     * Fix a team custom exercise for everybody. Admin+.
     *
     * These are the one thing already shared in place rather than copied (they
     * ride sync — see `SyncService.fetchExercises`), which is what makes editing
     * one natural: a typo in "Barbell Squt" is wrong in every program in the team
     * that points at it, and copying would not fix any of them.
     *
     * Only a team member's OWN custom exercise can be reached — never a seeded
     * library row, which belongs to nobody and is the same for every trainer in
     * the product.
     */
    @Transactional
    public void updateCustomExercise(UUID actorId, UUID exerciseId, UpdateCustomExerciseRequest req) {
        var s = scope.resolve(actorId);
        s.requireAdmin();

        var rows = jdbc.queryForList("""
                SELECT e.name AS name, e.trainer_id::text AS owner
                FROM exercise e
                WHERE e.id = :id::uuid
                  AND e.is_custom
                  AND e.deleted_at IS NULL
                  AND e.trainer_id = ANY (CAST(:visible AS uuid[]))
                """, Map.of("id", exerciseId.toString(), "visible", s.visibleTrainerIdArray()));
        if (rows.isEmpty()) throw TeamRuleException.exerciseNotInTeam();

        String owner = (String) rows.getFirst().get("owner");
        String previousName = (String) rows.getFirst().get("name");

        jdbc.update("""
                UPDATE exercise SET
                    name             = COALESCE(:name, name),
                    muscle_group     = COALESCE(:muscleGroup, muscle_group),
                    equipment        = COALESCE(:equipment, equipment),
                    movement_pattern = COALESCE(:pattern, movement_pattern),
                    description      = COALESCE(:description, description),
                    updated_at       = NOW()
                WHERE id = :id::uuid AND is_custom AND deleted_at IS NULL
                """, params(
                "id", exerciseId.toString(),
                "name", req.name() == null ? null : req.name().trim(),
                "muscleGroup", req.muscleGroup(),
                "equipment", req.equipment(),
                "pattern", req.movementPattern(),
                "description", req.description()));

        // Their own exercise is theirs to edit and accounts to nobody.
        if (!actorId.toString().equals(owner)) {
            String name = req.name() == null || req.name().isBlank() ? previousName : req.name().trim();
            recordRaw(s.teamId(), actorId, UUID.fromString(owner), null,
                    "exercise", exerciseId, "updated",
                    previousName.equals(name)
                            ? "Edited the shared exercise %s".formatted(name)
                            : "Renamed %s to %s".formatted(previousName, name));
            notify(owner, "A shared exercise changed",
                    "Someone in your team edited " + name + ".");
        }
    }

    /* ----------------------------------------------------------- the account */

    /**
     * Who changed what, on whose clients.
     *
     * Readable by <b>any</b> member and not just admins, deliberately — the
     * coach whose plan was edited is the whole reason this record exists, and a
     * log only its authors can read is not an account of anything. A plain coach
     * sees the rows about their own clients; an admin sees the team's.
     */
    @Transactional(readOnly = true)
    public List<ActivityRow> activity(UUID trainerId, UUID clientId) {
        var s = scope.resolve(trainerId);
        UUID teamId = s.requireTeam();

        // An admin sees the crossings in the whole team; a coach sees the ones
        // that happened to them. Same query, different scope, from TeamScope.
        String visibility = s.administers()
                ? "a.team_id = :teamId::uuid"
                : "a.subject_trainer_id = :tid::uuid";

        var params = params(
                "teamId", teamId.toString(),
                "tid", trainerId.toString(),
                "cid", clientId == null ? null : clientId.toString());

        return jdbc.queryForList("""
                SELECT a.id::text                 AS id,
                       a.actor_trainer_id::text   AS actor_id,
                       actor.name                 AS actor_name,
                       a.subject_trainer_id::text AS subject_id,
                       subject.name               AS subject_name,
                       a.client_id::text          AS client_id,
                       c.name                     AS client_name,
                       a.entity_type              AS entity_type,
                       a.action                   AS action,
                       a.summary                  AS summary,
                       a.created_at               AS created_at
                FROM team_activity a
                JOIN trainer actor   ON actor.id   = a.actor_trainer_id
                JOIN trainer subject ON subject.id = a.subject_trainer_id
                LEFT JOIN client c   ON c.id = a.client_id
                WHERE %s
                  AND (CAST(:cid AS uuid) IS NULL OR a.client_id = CAST(:cid AS uuid))
                ORDER BY a.created_at DESC
                LIMIT 50
                """.formatted(visibility), params)
                .stream()
                .map(r -> new ActivityRow(
                        UUID.fromString((String) r.get("id")),
                        UUID.fromString((String) r.get("actor_id")), (String) r.get("actor_name"),
                        UUID.fromString((String) r.get("subject_id")), (String) r.get("subject_name"),
                        r.get("client_id") == null ? null : UUID.fromString((String) r.get("client_id")),
                        (String) r.get("client_name"),
                        (String) r.get("entity_type"),
                        (String) r.get("action"),
                        (String) r.get("summary"),
                        ((Timestamp) r.get("created_at")).toInstant().toEpochMilli()))
                .toList();
    }

    /* --------------------------------------------------------------- guards */

    /** The program, its client's name, and whose it is. */
    private record Target(UUID teamId, UUID programId, UUID clientId, String clientName, UUID coachId) {}

    /**
     * Establishes that the caller may edit this program.
     *
     * Admin+, in the caller's team, and not deleted. The caller's OWN program is
     * allowed through — the endpoint is for editing a plan, and refusing it for
     * the one plan the caller owns would make the app branch before every call
     * for no gain. It simply writes no activity row.
     */
    private Target requireEditable(UUID actorId, UUID programId) {
        var s = scope.resolve(actorId);
        UUID teamId = s.requireAdmin();

        var rows = jdbc.queryForList("""
                SELECT p.client_id::text AS client_id, c.name AS client_name,
                       p.trainer_id::text AS coach_id
                FROM program p
                JOIN client c ON c.id = p.client_id
                WHERE p.id = :pid::uuid
                  AND p.trainer_id = ANY (CAST(:visible AS uuid[]))
                  AND p.deleted_at IS NULL
                """, Map.of("pid", programId.toString(), "visible", s.visibleTrainerIdArray()));
        if (rows.isEmpty()) throw TeamRuleException.programNotInTeam();

        var row = rows.getFirst();
        return new Target(teamId, programId,
                UUID.fromString((String) row.get("client_id")),
                (String) row.get("client_name"),
                UUID.fromString((String) row.get("coach_id")));
    }

    private ProgramExerciseRow requireInProgram(UUID programId, UUID exerciseRowId) {
        var rows = jdbc.queryForList("""
                SELECT 1 FROM program_exercise
                WHERE id = :id::uuid AND program_id = :pid::uuid AND deleted_at IS NULL
                """, Map.of("id", exerciseRowId.toString(), "pid", programId.toString()));
        if (rows.isEmpty()) throw TeamRuleException.programNotInTeam();
        return exercise(exerciseRowId);
    }

    /* ------------------------------------------------------------- internals */

    private List<ProgramExerciseRow> exercises(UUID programId) {
        return jdbc.queryForList("""
                SELECT pe.id::text AS id, pe.exercise_id::text AS exercise_id, e.name AS exercise_name,
                       pe.sets, pe.reps, pe.duration_seconds, pe.rest_seconds, pe.target_load,
                       pe.notes, pe.day_of_week, pe.week, pe.order_index
                FROM program_exercise pe
                JOIN exercise e ON e.id = pe.exercise_id
                WHERE pe.program_id = :pid::uuid AND pe.deleted_at IS NULL
                ORDER BY COALESCE(pe.week, 1), COALESCE(pe.day_of_week, 0), pe.order_index
                """, Map.of("pid", programId.toString()))
                .stream().map(TeamEditService::toExercise).toList();
    }

    private ProgramExerciseRow exercise(UUID id) {
        return toExercise(jdbc.queryForMap("""
                SELECT pe.id::text AS id, pe.exercise_id::text AS exercise_id, e.name AS exercise_name,
                       pe.sets, pe.reps, pe.duration_seconds, pe.rest_seconds, pe.target_load,
                       pe.notes, pe.day_of_week, pe.week, pe.order_index
                FROM program_exercise pe
                JOIN exercise e ON e.id = pe.exercise_id
                WHERE pe.id = :id::uuid
                """, Map.of("id", id.toString())));
    }

    private static ProgramExerciseRow toExercise(Map<String, Object> r) {
        return new ProgramExerciseRow(
                UUID.fromString((String) r.get("id")),
                UUID.fromString((String) r.get("exercise_id")),
                (String) r.get("exercise_name"),
                (Integer) r.get("sets"),
                (Integer) r.get("reps"),
                (Integer) r.get("duration_seconds"),
                (Integer) r.get("rest_seconds"),
                (BigDecimal) r.get("target_load"),
                (String) r.get("notes"),
                (Integer) r.get("day_of_week"),
                (Integer) r.get("week"),
                r.get("order_index") == null ? 0 : ((Number) r.get("order_index")).intValue());
    }

    /** Writes the crossing, and tells the coach. Silent when editing your own. */
    private void record(Target target, UUID actorId, String entityType, UUID entityId,
                        String action, String summary) {
        if (actorId.equals(target.coachId)) return;

        recordRaw(target.teamId, actorId, target.coachId, target.clientId,
                entityType, entityId, action, summary);
        notify(target.coachId.toString(), "A teammate changed a plan", summary);
    }

    private void recordRaw(UUID teamId, UUID actorId, UUID subjectId, UUID clientId,
                           String entityType, UUID entityId, String action, String summary) {
        jdbc.update("""
                INSERT INTO team_activity
                    (id, team_id, actor_trainer_id, subject_trainer_id, client_id,
                     entity_type, entity_id, action, summary, created_at)
                VALUES (:id::uuid, :teamId::uuid, :actor::uuid, :subject::uuid, :client::uuid,
                        :entityType, :entity::uuid, :action, :summary, :now)
                """, params(
                "id", UUID.randomUUID().toString(),
                "teamId", teamId.toString(),
                "actor", actorId.toString(),
                "subject", subjectId.toString(),
                "client", clientId == null ? null : clientId.toString(),
                "entityType", entityType,
                "entity", entityId.toString(),
                "action", action,
                "summary", truncate(summary),
                "now", Timestamp.from(Instant.now())));
        log.info("team {} activity actor={} subject={} {} {} {}",
                teamId, actorId, subjectId, action, entityType, entityId);
    }

    /* ------------------------------------------------------------- sentences */

    /** "Day 2" — ordinal within the program, which is what a program day IS (V24). */
    private static String dayLabel(ProgramExerciseRow row) {
        Integer day = row.dayOfWeek();
        Integer week = row.week();
        String base = day == null ? "plan" : "day " + day;
        return week != null && week > 1 ? "week %d %s".formatted(week, base) : base;
    }

    /** "4 × 6", or "3 × 45s" for a hold. */
    private static String prescriptionLine(ProgramExerciseRow row) {
        int sets = row.sets() == null ? 0 : row.sets();
        if (row.durationSeconds() != null) return "%d × %ds".formatted(sets, row.durationSeconds());
        if (row.reps() != null) return "%d × %d".formatted(sets, row.reps());
        return sets > 0 ? "%d sets".formatted(sets) : "a new prescription";
    }

    private static String truncate(String summary) {
        return summary.length() <= 300 ? summary : summary.substring(0, 297) + "…";
    }

    private static Map<String, Object> prescription(
            Integer sets, Integer reps, Integer durationSeconds, Integer restSeconds,
            BigDecimal targetLoad, String notes, Integer dayOfWeek, Integer week, Integer orderIndex) {
        return params(
                "sets", sets, "reps", reps, "durationSeconds", durationSeconds,
                "restSeconds", restSeconds, "targetLoad", targetLoad, "notes", notes,
                "dayOfWeek", dayOfWeek, "week", week, "orderIndex", orderIndex);
    }

    private void notify(String trainerId, String title, String body) {
        try {
            push.sendToTrainer(UUID.fromString(trainerId), title, body, Map.of("type", "team_edit"));
        } catch (RuntimeException e) {
            log.warn("team edit push to trainer={} failed: {}", trainerId, e.getMessage());
        }
    }

    private static Map<String, Object> params(Object... kv) {
        var map = new HashMap<String, Object>();
        for (int i = 0; i < kv.length; i += 2) map.put((String) kv[i], kv[i + 1]);
        return map;
    }
}
