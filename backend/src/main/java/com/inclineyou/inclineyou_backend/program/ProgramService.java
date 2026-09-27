package com.inclineyou.inclineyou_backend.program;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.inclineyou.inclineyou_backend.template.TemplateService;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class ProgramService {

    private final NamedParameterJdbcTemplate jdbc;
    private final TemplateService templates;

    /**
     * `program.schedule` and `program_exercise.set_detail` are both jsonb
     * written by {@link TemplateService} through a SNAKE_CASE mapper, so
     * reading them back needs the same one. See the note on that field.
     */
    private static final ObjectMapper STORE = new ObjectMapper()
            .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);

    // ── DTOs ──────────────────────────────────────────────────────────────────

    public record CreateProgramRequest(
            @NotBlank String clientId,
            @NotBlank String name,
            String goal,
            Long startDate,
            Long endDate,
            String status
    ) {}

    public record UpdateProgramRequest(
            String name,
            String goal,
            Long startDate,
            Long endDate,
            String status
    ) {}

    public record ProgramExerciseRequest(
            @NotBlank String exerciseId,
            Integer sets,
            Integer reps,
            Integer restSeconds,
            BigDecimal targetLoad,
            String notes,
            Integer dayOfWeek,
            /** V20. Which week of the program. Null reads as week 1. */
            Integer week,
            int orderIndex,
            /**
             * V25's hold — "3 x 45s" — carried instead of reps. The column has
             * existed since V25 and `apply` has copied it since V25; this record
             * had no field for it, so a timed exercise added to a client's plan
             * over REST arrived with no prescription at all.
             */
            Integer durationSeconds,
            /* V31 — see the migration for what each one costs a build that
             * predates it. All four nullable, all four appended last. */
            String tempo,
            String altExerciseId,
            String groupId,
            List<TemplateService.SetDetail> setDetail,
            /* V10 · the named workout block on its day. See the migration: a
             * local handle, not a reference, and both nullable. */
            String workoutId,
            String workoutName
    ) {}

    public record UpdateProgramExerciseRequest(
            Integer sets,
            Integer reps,
            Integer restSeconds,
            BigDecimal targetLoad,
            String notes,
            Integer dayOfWeek,
            Integer week,
            Integer orderIndex,
            Integer durationSeconds,
            String tempo,
            String altExerciseId,
            String groupId,
            List<TemplateService.SetDetail> setDetail,
            /* V10. Null leaves alone; "" clears, like altExerciseId above. */
            String workoutId,
            String workoutName
    ) {}

    public record ProgramResponse(
            String id,
            String clientId,
            String templateId,
            String name,
            String goal,
            String startDate,
            String endDate,
            String status,
            long createdAt,
            long updatedAt,
            /*
             * V2 · THE COPY'S OWN SHAPE, and the four are appended last per the
             * schema law — an older build reads the ten it always read.
             *
             * These three are `template`'s columns and were deliberately not
             * here while a program was a read-only snapshot of exercise rows:
             * the labels could be looked up through `templateId` and nothing
             * could disagree. A copy a trainer EDITS cannot borrow them, and
             * the migration carries the argument.
             *
             * `dayLabels` and `trainingDays` are keyed by WEEKDAY here where the
             * template keys them by ordinal slot — `copyBlueprintInto` has
             * translated the rows that way since V24, and the shape has to sit
             * in the same week the rows do.
             */
            Map<String, String> dayLabels,
            Integer weeks,
            List<Integer> trainingDays,
            /** When this copy last TOOK the blueprint. Not when it was edited. */
            Long syncedAt,
            /*
             * ── APPENDED · THE TRANSLATION ITSELF ────────────────────────────
             *
             * Ordinal slot → the weekday and time this client trains it. Written
             * by {@code apply} and by {@code AssignPanel}, read by nothing until
             * now — and the diff on {@code /clients/:id/program/:pid} is what
             * wanted it. That screen compares a blueprint against this copy and
             * had no way to line the two up: a template's {@code day_of_week} is
             * an ORDINAL SLOT and a copy's is a CONCRETE WEEKDAY, so a
             * Mon/Wed/Fri client's brand-new plan reported every row on both
             * sides of the ledger — <i>15 changes</i> on a copy nobody had
             * touched, under a line reading <i>this copy is level with the plan
             * it came from</i>. {@link com.inclineyou.inclineyou_backend.program.PlanDiff}
             * states the rule and takes the same map; the browser's copy of that
             * diff could not, because the map was not on the wire.
             *
             * <p>Null for a plan written from scratch and for one applied before
             * the column existed — neither has a blueprint to line up against.
             */
            List<TemplateService.ScheduleEntry> schedule
    ) {}

    /**
     * THE WHOLE PRESCRIPTION AT ONCE, which is what an autosaving builder needs.
     *
     * The per-row writes above stay: the session log reaches for one of them
     * when a trainer swaps an exercise mid-workout, and that is a single edit
     * with a single row's worth of intent behind it. A BOARD is not — one drag
     * moves every row under it, and thirteen ordered round trips whose failure
     * is partial is not a save. So `/clients/:id/program/:pid` holds a draft and
     * presses this, exactly as the blueprint builder presses
     * `PUT /v1/templates/{id}`.
     */
    public record ReplaceExercisesRequest(
            List<ProgramExerciseRequest> exercises,
            /* The shape, optional and independent: a save that only reordered
             * rows sends no labels, and a rename sends no rows. */
            Map<String, String> dayLabels,
            Integer weeks,
            List<Integer> trainingDays,
            String name
    ) {}

    public record ProgramExerciseResponse(
            String id,
            String programId,
            String exerciseId,
            Integer sets,
            Integer reps,
            Integer restSeconds,
            BigDecimal targetLoad,
            String notes,
            Integer dayOfWeek,
            Integer week,
            int orderIndex,
            long createdAt,
            long updatedAt,
            /* Appended last, per the schema law. */
            Integer durationSeconds,
            String tempo,
            String altExerciseId,
            String groupId,
            List<TemplateService.SetDetail> setDetail,
            /* V10 · appended last. */
            String workoutId,
            String workoutName
    ) {}

    /**
     * What a resync moved. Counts rather than rows, because the caller's next
     * act is to re-read the plan and the numbers are what the confirmation says.
     */
    public record ResyncResult(
            String programId,
            String templateId,
            int removed,
            int added
    ) {}

    // ── List ──────────────────────────────────────────────────────────────────

    public List<ProgramResponse> list(UUID trainerId, String clientId) {
        var conditions = new ArrayList<String>();
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        conditions.add("trainer_id = :tid::uuid");
        conditions.add("deleted_at IS NULL");

        if (clientId != null && !clientId.isBlank()) {
            p.put("cid", clientId);
            conditions.add("client_id = :cid::uuid");
        }

        var rows = jdbc.queryForList(
                "SELECT id::text, client_id::text, template_id::text, name, goal, " +
                "start_date::text, end_date::text, status, created_at, updated_at, " +
                "day_labels::text AS day_labels, weeks, training_days, synced_at, " +
                "schedule::text AS schedule FROM program WHERE " +
                String.join(" AND ", conditions) + " ORDER BY created_at DESC", p);

        return rows.stream().map(this::toProgramResponse).toList();
    }

    // ── Create ────────────────────────────────────────────────────────────────

    @Transactional
    public ProgramResponse create(UUID trainerId, CreateProgramRequest req) {
        Boolean owned = jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM client WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)",
                Map.of("cid", req.clientId(), "tid", trainerId.toString()), Boolean.class);
        if (!Boolean.TRUE.equals(owned)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Client not found");
        }

        UUID id = UUID.randomUUID();
        Instant now = Instant.now();
        String status = req.status() != null && !req.status().isBlank() ? req.status() : "active";
        Date startDate = req.startDate() != null ? new Date(req.startDate()) : null;
        Date endDate   = req.endDate()   != null ? new Date(req.endDate())   : null;

        var p = new HashMap<String, Object>();
        p.put("id",        id.toString());
        p.put("tid",       trainerId.toString());
        p.put("cid",       req.clientId());
        p.put("name",      req.name());
        p.put("goal",      req.goal());
        p.put("startDate", startDate);
        p.put("endDate",   endDate);
        p.put("status",    status);
        p.put("now",       Timestamp.from(now));

        jdbc.update("""
                INSERT INTO program (id, trainer_id, client_id, name, goal, start_date, end_date, status, created_at, updated_at)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, :name, :goal, :startDate, :endDate, :status, :now, :now)
                """, p);

        /* A program written from scratch has no blueprint behind it and takes
           no shape from one: no day names, no week count, no day list — and a
           null `syncedAt`, which is the honest answer to *when did this last
           take a template* for a plan that never did. The builder derives all
           four from the rows, which is what `daysOf` and `weekCountOf` have
           always done for a template with the columns unset. */
        return new ProgramResponse(id.toString(), req.clientId(), null, req.name(), req.goal(),
                startDate != null ? startDate.toString() : null,
                endDate   != null ? endDate.toString()   : null,
                status, now.toEpochMilli(), now.toEpochMilli(),
                null, null, null, null, null);
    }

    // ── Get ───────────────────────────────────────────────────────────────────

    public ProgramResponse get(UUID id, UUID trainerId) {
        return toProgramResponse(findOwned(id, trainerId));
    }

    // ── Update ────────────────────────────────────────────────────────────────

    @Transactional
    public ProgramResponse update(UUID id, UUID trainerId, UpdateProgramRequest req) {
        findOwned(id, trainerId);

        var sets = new ArrayList<String>();
        var p = new HashMap<String, Object>();
        p.put("id",  id.toString());
        p.put("tid", trainerId.toString());
        p.put("now", Timestamp.from(Instant.now()));
        sets.add("updated_at = :now");

        if (req.name() != null)      { p.put("name",      req.name());                       sets.add("name = :name"); }
        if (req.goal() != null)      { p.put("goal",      req.goal());                       sets.add("goal = :goal"); }
        if (req.startDate() != null) { p.put("startDate", new Date(req.startDate()));         sets.add("start_date = :startDate"); }
        if (req.endDate() != null)   { p.put("endDate",   new Date(req.endDate()));           sets.add("end_date = :endDate"); }
        if (req.status() != null)    { p.put("status",    req.status());                      sets.add("status = :status"); }

        jdbc.update("UPDATE program SET " + String.join(", ", sets) +
                    " WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL", p);

        var updated = findOwned(id, trainerId);
        return toProgramResponse(updated);
    }

    // ── Delete ────────────────────────────────────────────────────────────────

    @Transactional
    public void delete(UUID id, UUID trainerId) {
        findOwned(id, trainerId);
        jdbc.update("""
                UPDATE program SET deleted_at = NOW(), updated_at = NOW()
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("id", id.toString(), "tid", trainerId.toString()));
    }

    // ── List exercises ────────────────────────────────────────────────────────

    public List<ProgramExerciseResponse> listExercises(UUID programId, UUID trainerId) {
        findOwned(programId, trainerId);
        var rows = jdbc.queryForList("""
                SELECT id::text, program_id::text, exercise_id::text, sets, reps, rest_seconds,
                       target_load, notes, day_of_week, week, order_index, created_at, updated_at,
                       duration_seconds, tempo, alt_exercise_id::text, group_id::text,
                       set_detail::text AS set_detail, workout_id, workout_name
                FROM program_exercise
                WHERE program_id = :pid::uuid AND deleted_at IS NULL
                ORDER BY COALESCE(week, 1), COALESCE(day_of_week, 999), order_index ASC
                """, Map.of("pid", programId.toString()));

        return rows.stream().map(this::toExerciseResponse).toList();
    }

    // ── Replace every exercise, and the shape with them ───────────────────────

    /**
     * THE CLIENT PLAN BUILDER'S SAVE — one PUT of the whole prescription.
     *
     * `/clients/:id/program/:pid` is the copy in the builder: the same board the
     * blueprint is written on, pointed at this client's own rows. Every
     * structural change there is local until a debounce fires, and what it fires
     * is this — the same shape `PUT /v1/templates/{id}` has for the blueprint,
     * and for the same reason: one drag moves every row under it, and a dozen
     * ordered round trips whose failure is partial is not a save.
     *
     * ── IT DOES NOT TOUCH `synced_at`, AND THAT IS THE POINT ─────────────────
     *
     * Tuning a copy is not the same act as taking the blueprint. `synced_at`
     * answers *when did this copy last take the template* and moves on apply and
     * on resync only, so `AssignmentResponse.behindTemplate` keeps telling the
     * truth about a copy the trainer edited this morning.
     *
     * ── AND THE DAYS ARE THIS CLIENT'S WEEKDAYS ──────────────────────────────
     *
     * `program_exercise.day_of_week` is a concrete weekday on a copy — V24's
     * translation, done once at apply through `program.schedule` — where a
     * blueprint carries ordinal slots. Rows arrive here already in the client's
     * week, because the screen that sends them has been reading them in it; this
     * method performs no translation of its own and must not start, or a save
     * would move somebody's Thursday by the difference between two numbering
     * systems.
     */
    @Transactional
    public List<ProgramExerciseResponse> replaceExercises(UUID programId, UUID trainerId,
                                                          ReplaceExercisesRequest req) {
        findOwned(programId, trainerId);
        Instant now = Instant.now();
        Timestamp ts = Timestamp.from(now);

        /* SOFT, like every other delete in this schema: sync has to propagate
           the tombstone, so a row the trainer removed has to be a row the phone
           is told about rather than one that merely stops appearing. */
        jdbc.update("""
                UPDATE program_exercise SET deleted_at = :now, updated_at = :now
                WHERE program_id = :pid::uuid AND deleted_at IS NULL
                """, Map.of("pid", programId.toString(), "now", ts));

        var rows = req.exercises() == null ? List.<ProgramExerciseRequest>of() : req.exercises();
        /* A superset's correlation id is minted per PROGRAM and never carried in
           from a client, for `copyBlueprintInto`'s reason: two people's plans
           must not share one. The draft's own ids are keys for a board and mean
           nothing to this table. */
        var groups = new HashMap<String, String>();

        for (var ex : rows) {
            var p = new HashMap<String, Object>();
            p.put("id",              UUID.randomUUID().toString());
            p.put("programId",       programId.toString());
            p.put("exerciseId",      ex.exerciseId());
            p.put("sets",            ex.sets());
            p.put("reps",            ex.reps());
            p.put("restSeconds",     ex.restSeconds());
            p.put("durationSeconds", ex.durationSeconds());
            p.put("targetLoad",      ex.targetLoad());
            p.put("notes",           ex.notes());
            p.put("tempo",           ex.tempo());
            p.put("altExerciseId",   ex.altExerciseId());
            p.put("groupId",         ex.groupId() == null ? null
                    : groups.computeIfAbsent(ex.groupId(), k -> UUID.randomUUID().toString()));
            p.put("setDetail",       toJson(ex.setDetail()));
            p.put("dayOfWeek",       ex.dayOfWeek());
            p.put("week",            ex.week() == null ? 1 : ex.week());
            p.put("orderIndex",      ex.orderIndex());
            // V10 · kept as sent (trimmed and cut to width), NOT re-minted like
            // the group id: it is the board's own handle for the block, and a
            // save that re-minted it would break the builder's selection.
            p.put("workoutId",       TemplateService.clip(ex.workoutId(), TemplateService.MAX_WORKOUT_ID));
            p.put("workoutName",     TemplateService.clip(ex.workoutName(), TemplateService.MAX_WORKOUT_NAME));
            p.put("now",             ts);

            jdbc.update("""
                    INSERT INTO program_exercise (id, program_id, exercise_id, sets, reps,
                        rest_seconds, duration_seconds, target_load, notes, day_of_week, week,
                        order_index, tempo, alt_exercise_id, group_id, set_detail,
                        workout_id, workout_name, created_at, updated_at)
                    VALUES (:id::uuid, :programId::uuid, :exerciseId::uuid, :sets, :reps,
                        :restSeconds, :durationSeconds, :targetLoad, :notes, :dayOfWeek, :week,
                        :orderIndex, :tempo, :altExerciseId::uuid, :groupId::uuid,
                        CAST(:setDetail AS jsonb), :workoutId, :workoutName, :now, :now)
                    """, p);
        }

        /* THE SHAPE, FIELD BY FIELD AND ONLY WHERE ONE WAS SENT. A save that
           reordered rows sends no labels, and `COALESCE` would be the wrong
           instrument anyway: `{}` is a real answer meaning *this plan has no day
           names*, and it has to be distinguishable from *I am not telling you
           about the labels*. */
        var sets = new ArrayList<String>();
        var sp = new HashMap<String, Object>();
        sp.put("pid", programId.toString());
        sp.put("now", ts);
        sets.add("updated_at = :now");
        if (req.dayLabels() != null) {
            sp.put("dayLabels", toJson(req.dayLabels()));
            sets.add("day_labels = CAST(:dayLabels AS jsonb)");
        }
        if (req.weeks() != null) { sp.put("weeks", req.weeks()); sets.add("weeks = :weeks"); }
        if (req.trainingDays() != null) {
            sp.put("trainingDays", templates.dayCsv(req.trainingDays()));
            sets.add("training_days = :trainingDays");
        }
        if (req.name() != null && !req.name().isBlank()) {
            sp.put("name", req.name().trim());
            sets.add("name = :name");
        }
        jdbc.update("UPDATE program SET " + String.join(", ", sets)
                + " WHERE id = :pid::uuid", sp);

        return listExercises(programId, trainerId);
    }

    // ── Add exercise ──────────────────────────────────────────────────────────

    @Transactional
    public ProgramExerciseResponse addExercise(UUID programId, UUID trainerId, ProgramExerciseRequest req) {
        findOwned(programId, trainerId);

        UUID id = UUID.randomUUID();
        Instant now = Instant.now();

        var p = new HashMap<String, Object>();
        p.put("id",          id.toString());
        p.put("programId",   programId.toString());
        p.put("exerciseId",  req.exerciseId());
        p.put("sets",        req.sets());
        p.put("reps",        req.reps());
        p.put("restSeconds", req.restSeconds());
        p.put("targetLoad",  req.targetLoad());
        p.put("notes",       req.notes());
        p.put("dayOfWeek",   req.dayOfWeek());
        // An older build posts no week at all; that request means week 1, which
        // is the only week it knows how to draw.
        Integer week = req.week() != null ? req.week() : 1;
        p.put("week",        week);
        p.put("orderIndex",  req.orderIndex());
        p.put("durationSeconds", req.durationSeconds());
        p.put("tempo",           req.tempo());
        p.put("altExerciseId",   req.altExerciseId());
        p.put("groupId",         req.groupId());
        p.put("setDetail",       toJson(req.setDetail()));
        String workoutId   = TemplateService.clip(req.workoutId(), TemplateService.MAX_WORKOUT_ID);
        String workoutName = TemplateService.clip(req.workoutName(), TemplateService.MAX_WORKOUT_NAME);
        p.put("workoutId",       workoutId);
        p.put("workoutName",     workoutName);
        p.put("now",         Timestamp.from(now));

        jdbc.update("""
                INSERT INTO program_exercise (id, program_id, exercise_id, sets, reps, rest_seconds,
                    target_load, notes, day_of_week, week, order_index, duration_seconds, tempo,
                    alt_exercise_id, group_id, set_detail, workout_id, workout_name, created_at, updated_at)
                VALUES (:id::uuid, :programId::uuid, :exerciseId::uuid, :sets, :reps, :restSeconds,
                    :targetLoad, :notes, :dayOfWeek, :week, :orderIndex, :durationSeconds, :tempo,
                    :altExerciseId::uuid, :groupId::uuid, CAST(:setDetail AS jsonb),
                    :workoutId, :workoutName, :now, :now)
                """, p);

        return new ProgramExerciseResponse(id.toString(), programId.toString(), req.exerciseId(),
                req.sets(), req.reps(), req.restSeconds(), req.targetLoad(), req.notes(),
                req.dayOfWeek(), week, req.orderIndex(), now.toEpochMilli(), now.toEpochMilli(),
                req.durationSeconds(), req.tempo(), req.altExerciseId(), req.groupId(), req.setDetail(),
                workoutId, workoutName);
    }

    // ── Update exercise ───────────────────────────────────────────────────────

    @Transactional
    public ProgramExerciseResponse updateExercise(UUID programId, UUID exId, UUID trainerId,
                                                   UpdateProgramExerciseRequest req) {
        findOwned(programId, trainerId);

        var sets = new ArrayList<String>();
        var p = new HashMap<String, Object>();
        p.put("id",        exId.toString());
        p.put("programId", programId.toString());
        p.put("now",       Timestamp.from(Instant.now()));
        sets.add("updated_at = :now");

        if (req.sets() != null)        { p.put("sets",        req.sets());        sets.add("sets = :sets"); }
        if (req.reps() != null)        { p.put("reps",        req.reps());        sets.add("reps = :reps"); }
        if (req.restSeconds() != null) { p.put("restSeconds", req.restSeconds()); sets.add("rest_seconds = :restSeconds"); }
        if (req.targetLoad() != null)  { p.put("targetLoad",  req.targetLoad());  sets.add("target_load = :targetLoad"); }
        if (req.notes() != null)       { p.put("notes",       req.notes());       sets.add("notes = :notes"); }
        if (req.dayOfWeek() != null)   { p.put("dayOfWeek",   req.dayOfWeek());   sets.add("day_of_week = :dayOfWeek"); }
        if (req.week() != null)        { p.put("week",        req.week());        sets.add("week = :week"); }
        if (req.orderIndex() != null)  { p.put("orderIndex",  req.orderIndex());  sets.add("order_index = :orderIndex"); }
        if (req.durationSeconds() != null) { p.put("durationSeconds", req.durationSeconds()); sets.add("duration_seconds = :durationSeconds"); }
        if (req.tempo() != null)       { p.put("tempo",       req.tempo());       sets.add("tempo = :tempo"); }
        // Both of these are how a row is UNSET as well as set, so an empty
        // string is the clear rather than a second route. `alt_exercise_id`
        // takes a uuid, so the cast has to see NULL and not "".
        if (req.altExerciseId() != null) {
            p.put("altExerciseId", req.altExerciseId().isBlank() ? null : req.altExerciseId());
            sets.add("alt_exercise_id = :altExerciseId::uuid");
        }
        if (req.groupId() != null) {
            p.put("groupId", req.groupId().isBlank() ? null : req.groupId());
            sets.add("group_id = :groupId::uuid");
        }
        // V10. "" clears, like the two above; the value is trimmed and cut to width.
        if (req.workoutId() != null) {
            p.put("workoutId", TemplateService.clip(req.workoutId(), TemplateService.MAX_WORKOUT_ID));
            sets.add("workout_id = :workoutId");
        }
        if (req.workoutName() != null) {
            p.put("workoutName", TemplateService.clip(req.workoutName(), TemplateService.MAX_WORKOUT_NAME));
            sets.add("workout_name = :workoutName");
        }
        if (req.setDetail() != null) {
            // An empty list means "these sets agree again" — back to the scalar
            // `sets` and `reps`, which is the shape an old build reads right.
            p.put("setDetail", req.setDetail().isEmpty() ? null : toJson(req.setDetail()));
            sets.add("set_detail = CAST(:setDetail AS jsonb)");
        }

        jdbc.update("UPDATE program_exercise SET " + String.join(", ", sets) +
                    " WHERE id = :id::uuid AND program_id = :programId::uuid AND deleted_at IS NULL", p);

        var rows = jdbc.queryForList("""
                SELECT id::text, program_id::text, exercise_id::text, sets, reps, rest_seconds,
                       target_load, notes, day_of_week, week, order_index, created_at, updated_at,
                       duration_seconds, tempo, alt_exercise_id::text, group_id::text,
                       set_detail::text AS set_detail, workout_id, workout_name
                FROM program_exercise WHERE id = :id::uuid AND deleted_at IS NULL
                """, Map.of("id", exId.toString()));
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Program exercise not found");
        return toExerciseResponse(rows.get(0));
    }

    // ── Remove exercise ───────────────────────────────────────────────────────

    @Transactional
    public void removeExercise(UUID programId, UUID exId, UUID trainerId) {
        findOwned(programId, trainerId);
        jdbc.update("""
                UPDATE program_exercise SET deleted_at = NOW(), updated_at = NOW()
                WHERE id = :id::uuid AND program_id = :programId::uuid AND deleted_at IS NULL
                """, Map.of("id", exId.toString(), "programId", programId.toString()));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Map<String, Object> findOwned(UUID id, UUID trainerId) {
        var rows = jdbc.queryForList(
                "SELECT id::text, client_id::text, template_id::text, name, goal, " +
                "start_date::text, end_date::text, status, created_at, updated_at, " +
                "day_labels::text AS day_labels, weeks, training_days, synced_at, " +
                "schedule::text AS schedule FROM program " +
                "WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL",
                Map.of("id", id.toString(), "tid", trainerId.toString()));
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Program not found");
        return rows.get(0);
    }

    private ProgramResponse toProgramResponse(Map<String, Object> r) {
        Object synced = r.get("synced_at");
        return new ProgramResponse(
                str(r.get("id")),
                str(r.get("client_id")),
                str(r.get("template_id")),
                str(r.get("name")),
                str(r.get("goal")),
                str(r.get("start_date")),
                str(r.get("end_date")),
                str(r.get("status")),
                toEpochMilli(r.get("created_at")),
                toEpochMilli(r.get("updated_at")),
                readDayLabels(str(r.get("day_labels"))),
                r.get("weeks") == null ? null : ((Number) r.get("weeks")).intValue(),
                templates.parseDayCsv(str(r.get("training_days"))),
                /* NULL rather than 0 on a row written before V2's backfill ran.
                 * A reader must not be able to mistake "never took it" for
                 * "took it at the epoch", which would read as behind forever. */
                synced == null ? null : toEpochMilli(synced),
                readSchedule(str(r.get("schedule"))));
    }

    /**
     * The stored translation, or null.
     *
     * <p>Tolerant for {@code readDayLabels}' reason and one more: this column has
     * been written by three code paths over two years and a copy whose schedule
     * will not parse still has a plan in it. What a caller must never get is a
     * PARTIAL map — a diff lined up through half a schedule is worse than one
     * lined up through none, because it silently reports the unmapped days as
     * changes.
     */
    private List<TemplateService.ScheduleEntry> readSchedule(String json) {
        if (json == null || json.isBlank() || json.equals("null")) return null;
        try {
            var parsed = STORE.readValue(
                    json, new TypeReference<List<TemplateService.ScheduleEntry>>() {});
            return parsed == null || parsed.isEmpty() ? null : parsed;
        } catch (Exception e) {
            return null;
        }
    }

    /** The copy's day names. An unreadable value is no names rather than a
     *  failed read: a plan whose labels will not parse still has a plan in it. */
    private Map<String, String> readDayLabels(String json) {
        if (json == null || json.isBlank() || json.equals("null")) return null;
        try {
            return STORE.readValue(json, new TypeReference<Map<String, String>>() {});
        } catch (Exception e) {
            log.warn("Unreadable program day_labels: {}", e.getMessage());
            return null;
        }
    }

    private ProgramExerciseResponse toExerciseResponse(Map<String, Object> r) {
        Object tl = r.get("target_load");
        BigDecimal targetLoad = tl instanceof BigDecimal bd ? bd
                : (tl != null ? new BigDecimal(tl.toString()) : null);
        Object oi = r.get("order_index");
        int orderIndex = oi instanceof Integer i ? i : (oi != null ? Integer.parseInt(oi.toString()) : 0);

        return new ProgramExerciseResponse(
                str(r.get("id")),
                str(r.get("program_id")),
                str(r.get("exercise_id")),
                (Integer) r.get("sets"),
                (Integer) r.get("reps"),
                (Integer) r.get("rest_seconds"),
                targetLoad,
                str(r.get("notes")),
                (Integer) r.get("day_of_week"),
                (Integer) r.get("week"),
                orderIndex,
                toEpochMilli(r.get("created_at")),
                toEpochMilli(r.get("updated_at")),
                (Integer) r.get("duration_seconds"),
                str(r.get("tempo")),
                str(r.get("alt_exercise_id")),
                str(r.get("group_id")),
                readSetDetail(str(r.get("set_detail"))),
                str(r.get("workout_id")),
                str(r.get("workout_name")));
    }

    // ── Resync — push a blueprint change onto one client's copy ───────────────

    /**
     * The one way a template edit reaches a client who is already on it.
     *
     * The two tables are two tables precisely so this does NOT happen by itself:
     * `apply` snapshots, and editing the blueprint afterwards changes the
     * blueprint and nothing else. That is what makes duplicate-and-tweak safe
     * with six clients on the original. So this is a route the trainer presses,
     * on one program at a time, having been told what it will do.
     *
     * <p>Three things about what it touches, because the boundary is the whole
     * design:
     *
     * <ul>
     *   <li><b>The client's SCHEDULE is kept, not re-asked.</b> The weekday and
     *       time each ordinal slot landed on are the client's, chosen once at
     *       assign time, and a blueprint edit is not a reason to move somebody's
     *       Tuesday. The stored `program.schedule` is replayed through the same
     *       translation `apply` runs. A blueprint that has GROWN a day since —
     *       three days a week where the client was scheduled for two — is a 400
     *       naming the mismatch, because inventing a weekday for the new day is
     *       exactly the invention the count-match rule exists to refuse.</li>
     *   <li><b>History is not touched.</b> `workout_session`, `set_log` and
     *       `scheduled_session` key on the program, the exercise and the client,
     *       never on a `program_exercise` row id. Every set this client has ever
     *       logged reads back identically afterwards. What changes is the PLAN
     *       from here on, which is what was asked for.</li>
     *   <li><b>The old rows are tombstoned, not deleted.</b> Soft delete, like
     *       every other removal in this schema, so the sync envelope can tell
     *       the phone they are gone.</li>
     * </ul>
     */
    @Transactional
    public ResyncResult resync(UUID programId, UUID trainerId) {
        var program = findOwned(programId, trainerId);
        String templateId = str(program.get("template_id"));
        if (templateId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "This program was written from scratch, not from a template — there is nothing to pull from.");
        }

        var blueprint = templates.blueprintOf(UUID.fromString(templateId), trainerId);

        var schedule = readSchedule(programId);
        var bySlot = new HashMap<Integer, TemplateService.ScheduleEntry>();
        for (var entry : schedule) bySlot.put(entry.day(), entry);

        var missing = new TreeSet<>(blueprint.slots());
        missing.removeAll(bySlot.keySet());
        if (!missing.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    ("This program now trains %d day%s a week and this client is only scheduled for %d. "
                     + "Assign it again to choose when the new day%s happen.")
                            .formatted(blueprint.slots().size(), blueprint.slots().size() == 1 ? "" : "s",
                                       bySlot.size(), missing.size() == 1 ? "" : "s"));
        }

        Instant now = Instant.now();
        int removed = jdbc.update("""
                UPDATE program_exercise SET deleted_at = :now, updated_at = :now
                WHERE program_id = :pid::uuid AND deleted_at IS NULL
                """, Map.of("pid", programId.toString(), "now", Timestamp.from(now)));

        templates.copyBlueprintInto(programId, blueprint.entries(), bySlot, now);

        /* V2 · THE WHOLE PRESCRIPTION, WHICH IS THE SHAPE AS WELL AS THE ROWS.
           A push that left the client on eight weeks of a nine-week block, or
           kept a day name the blueprint has since changed, would be a resync
           that did not resync. `shapeFor` translates the template's ordinal
           slots into this client's weekdays, exactly as `copyBlueprintInto` has
           translated the rows since V24.

           AND `synced_at` MOVES HERE. This is the second of the two moments a
           copy takes the blueprint — the other is apply — and it is what
           `behindTemplate` has read since V2. */
        var shape = templates.shapeFor(UUID.fromString(templateId), trainerId, bySlot);
        jdbc.update("""
                UPDATE program SET updated_at = :now, synced_at = :now,
                       day_labels = CAST(:dayLabels AS jsonb), weeks = :weeks,
                       training_days = :trainingDays
                WHERE id = :pid::uuid
                """,
                /* A HashMap and not `Map.of`, which refuses a null value: a
                   blueprint with no week count and a copy with no day names are
                   both ordinary, and both are nulls this statement must be able
                   to write. */
                shapeParams(programId, now, shape));

        return new ResyncResult(programId.toString(), templateId, removed, blueprint.entries().size());
    }

    private Map<String, Object> shapeParams(UUID programId, Instant now,
                                            TemplateService.ProgramShape shape) {
        var p = new HashMap<String, Object>();
        p.put("pid",          programId.toString());
        p.put("now",          Timestamp.from(now));
        p.put("dayLabels",    toJson(shape.dayLabels()));
        p.put("weeks",        shape.weeks());
        p.put("trainingDays", templates.dayCsv(shape.trainingDays()));
        return p;
    }

    /** The client's own day layout, as `apply` wrote it. */
    private List<TemplateService.ScheduleEntry> readSchedule(UUID programId) {
        String json = jdbc.queryForObject(
                "SELECT schedule::text FROM program WHERE id = :pid::uuid",
                Map.of("pid", programId.toString()), String.class);
        if (json == null || json.isBlank() || json.equals("null")) return List.of();
        try {
            return STORE.readValue(json, new TypeReference<List<TemplateService.ScheduleEntry>>() {});
        } catch (Exception e) {
            log.warn("Unreadable program schedule on {}: {}", programId, e.getMessage());
            return List.of();
        }
    }

    private List<TemplateService.SetDetail> readSetDetail(String json) {
        if (json == null || json.isBlank() || json.equals("null")) return null;
        try {
            var out = STORE.readValue(json, new TypeReference<List<TemplateService.SetDetail>>() {});
            return out.isEmpty() ? null : out;
        } catch (Exception e) {
            log.warn("Unreadable set_detail: {}", e.getMessage());
            return null;
        }
    }

    private String toJson(Object v) {
        if (v == null) return null;
        try { return STORE.writeValueAsString(v); }
        catch (Exception e) { return null; }
    }

    private String str(Object v) { return v == null ? null : v.toString(); }

    private long toEpochMilli(Object v) {
        if (v instanceof java.sql.Timestamp ts)          return ts.toInstant().toEpochMilli();
        if (v instanceof java.time.OffsetDateTime odt)   return odt.toInstant().toEpochMilli();
        if (v instanceof java.time.LocalDateTime ldt)    return ldt.toInstant(java.time.ZoneOffset.UTC).toEpochMilli();
        if (v instanceof java.time.Instant i)            return i.toEpochMilli();
        return 0L;
    }
}
