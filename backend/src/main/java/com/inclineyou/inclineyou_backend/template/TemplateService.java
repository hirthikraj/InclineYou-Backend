package com.inclineyou.inclineyou_backend.template;

import com.inclineyou.inclineyou_backend.session.DiaryService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.inclineyou.inclineyou_backend.program.PlanDiff;
import com.inclineyou.inclineyou_backend.program.ProgramRuleException;
import com.inclineyou.inclineyou_backend.session.SessionPlanner;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class TemplateService {

    private final NamedParameterJdbcTemplate jdbc;
    /** V3 · a plan arriving names the sessions already booked. See {@link #apply}. */
    private final DiaryService diary;

    /**
     * The blueprint's STORAGE format, and the only place snake_case is correct.
     *
     * `template.structure` is jsonb read by three writers — this service, the
     * sync push, and the phone's own `parseBlueprint` in
     * `app/src/training/training.ts`, which keys on `exercise_id`,
     * `day_of_week`, `rest_seconds`, `duration_seconds` and `order_index`. That
     * makes snake_case the contract, not a style: a blueprint written in
     * camelCase is one the phone renders as an empty program.
     *
     * What was wrong until 28 Aug 2026 is that the same keys reached the WIRE.
     * `TemplateResponse.exercises` was `List<Map<String,Object>>` handed
     * straight out of this parser, so `GET /v1/templates` answered with
     * `exercise_id` while `API.md` had always documented `exerciseId` — and the
     * web app, its only REST consumer, read every field as `undefined` and drew
     * every template as "0 days a week" with no exercises in it. The wire is a
     * typed record now, in the casing the contract always claimed; the storage
     * format is untouched, so no phone build notices.
     */
    /** "Today" for ending a plan is an Indian calendar day, not the server's. */
    private static final java.time.ZoneId IST = java.time.ZoneId.of("Asia/Kolkata");

    private static final ObjectMapper STORE = new ObjectMapper()
            .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);

    // ── DTOs ──────────────────────────────────────────────────────────────────

    /**
     * One set of a per-set prescription. V31 · §05 of the design set.
     *
     * "Four sets, the last two to failure" is an ordinary prescription and an
     * exercise-level mode cannot say it, so `sets` stops being the whole story
     * and this list is the rest of it. Absent on the overwhelming majority of
     * entries, which are straight sets and say so in `sets` and `reps` alone.
     */
    public record SetDetail(
            Integer reps,
            Integer durationSeconds,
            Boolean toFailure
    ) {}

    public record TemplateExerciseInput(
            String exerciseId,
            Integer sets,
            Integer reps,
            Integer restSeconds,
            Double targetLoad,
            String notes,
            Integer dayOfWeek,
            int orderIndex,
            /*
             * V20's week, and it has been unsayable over REST since V20 landed.
             * The column exists on `program_exercise`, the key exists in the
             * blueprint JSON, the phone reads it, `apply` copies it — and this
             * record had no field for it, so Jackson dropped it on every POST
             * and PUT. A multi-week template could not be authored on the web
             * at all: every entry came back as week 1 however it was sent.
             */
            Integer week,
            /* V25. A hold — "3 × 45s" — carried instead of reps. Same story. */
            Integer durationSeconds,
            /* V31 · the four below. See the migration for what each one costs. */
            String tempo,
            String altExerciseId,
            String groupId,
            List<SetDetail> setDetail,
            /*
             * V10 · which named workout on its day this entry belongs to. A local
             * handle the builder mints, NOT a reference to `workout_template` —
             * and the name a person reads ("Upper A"). Both nullable: an entry
             * with neither is its day's single unnamed block, which is every
             * entry written before V10.
             */
            String workoutId,
            String workoutName
    ) {
        /** Trimmed, blank as null, and cut to the copy's column widths (64 / 120). */
        TemplateExerciseInput normalised() {
            return new TemplateExerciseInput(exerciseId, sets, reps, restSeconds, targetLoad, notes,
                    dayOfWeek, orderIndex, week, durationSeconds, tempo, altExerciseId, groupId,
                    setDetail, clip(workoutId, MAX_WORKOUT_ID), clip(workoutName, MAX_WORKOUT_NAME));
        }
    }

    /** The widths of `program_exercise.workout_id` / `workout_name` (V10). */
    public static final int MAX_WORKOUT_ID = 64;
    public static final int MAX_WORKOUT_NAME = 120;

    public static String clip(String raw, int max) {
        if (raw == null || raw.isBlank()) return null;
        String v = raw.strip();
        return v.length() > max ? v.substring(0, max) : v;
    }

    /** One client on the shelf's avatar cluster. */
    public record AssignedClient(String id, String name) {}

    public record CreateTemplateRequest(
            @NotBlank String name,
            String goal,
            String description,
            List<TemplateExerciseInput> exercises,
            Map<String, String> dayLabels,
            /*
             * How many weeks the program runs, and which ordinal day slots it
             * lays out. Both columns predate this record — `weeks` since V20,
             * `training_days` since V24 — and neither was ever writable over
             * REST, so every web-authored template wrote NULL to both and the
             * day layout had to be inferred back from wherever exercises
             * happened to land.
             *
             * That inference is the trap the design set names: the first
             * exercise goes on Day 1, Day 1 becomes the only day the program
             * has, and there is nowhere left to put Day 2's first exercise. A
             * day exists when the trainer lays it out, not when something lands
             * on it.
             */
            Integer weeks,
            List<Integer> trainingDays
    ) {}

    public record UpdateTemplateRequest(
            String name,
            String goal,
            String description,
            List<TemplateExerciseInput> exercises,
            Map<String, String> dayLabels,
            Integer weeks,
            List<Integer> trainingDays
    ) {}

    /**
     * One day slot of the client's chosen layout: template "Day 2" lands on
     * `weekday` (ISO, 1 = Monday) at `time` ("HH:mm", 24-hour).
     */
    public record ScheduleEntry(int day, int weekday, String time) {}

    public record ApplyTemplateRequest(
            @NotBlank String clientId,
            String name,
            String goal,
            Long startDate,
            Long endDate,
            List<ScheduleEntry> schedule
    ) {}

    /**
     * A blueprint entry, on the wire, in the casing `API.md` documents.
     *
     * Nullable everywhere except the two things an entry cannot exist without,
     * because a blueprint written by a build that predates any given field has
     * to read back as "not said" rather than as a default somebody typed.
     */
    public record TemplateExerciseResponse(
            String exerciseId,
            Integer sets,
            Integer reps,
            Integer restSeconds,
            Double targetLoad,
            String notes,
            Integer dayOfWeek,
            int orderIndex,
            Integer week,
            Integer durationSeconds,
            String tempo,
            String altExerciseId,
            String groupId,
            List<SetDetail> setDetail,
            /* V10 · appended last. See TemplateExerciseInput. */
            String workoutId,
            String workoutName
    ) {}

    public record TemplateResponse(
            String id,
            String name,
            String goal,
            String description,
            List<TemplateExerciseResponse> exercises,
            Map<String, String> dayLabels,
            long createdAt,
            long updatedAt,
            /* Appended last, per the schema law. */
            Integer weeks,
            List<Integer> trainingDays,
            /*
             * "9 clients on this" — the figure the shelf row is chosen by, and
             * the reason a trainer duplicates rather than edits. Counted in SQL
             * over `program.template_id`, because deriving it in the browser
             * would mean shipping every program on the account to a screen with
             * no other use for them.
             *
             * `assignedCount` is every copy ever made; `activeAssignedCount` is
             * the copies still running. Both, because they answer different
             * questions: the first is how proven this blueprint is, the second
             * is how much breaks if it changes.
             */
            int assignedCount,
            int activeAssignedCount,
            /*
             * ── APPENDED 23 SEP 2026 · WHO IS ON IT ──────────────────────────
             * The shelf's avatar cluster: at most SAMPLE_SIZE of the clients on
             * an ACTIVE copy, ordered by name and then id so it cannot reshuffle
             * between loads. A sample and never a count — `activeAssignedCount`
             * stays the authority for "+3 more", and nothing may derive a count
             * from this list's length. Only the caller's own clients: a
             * template's copies can sit with a teammate after a reassignment,
             * and a coach must not read a teammate's client names off a shelf.
             */
            List<AssignedClient> assignedClients,
            /*
             * ── APPENDED BY V11 · WHERE IT CAME FROM ─────────────────────────
             * 'own' on every row of this shelf — a copy of a certified program
             * is the trainer's own the moment it exists. The certified list
             * answers 'certified' in the same field.
             */
            String source,
            /**
             * The certified original this was copied from, AS AT COPY TIME —
             * or null. `updatedAt` older than the original's current one is how
             * the builder says "the original was revised since you copied it".
             */
            CopiedFrom copiedFrom
    ) {}

    /** V11 · the provenance of a copy, frozen when it was taken. */
    public record CopiedFrom(String id, String name, Long updatedAt) {}

    public record ProgramSummary(
            String id,
            String clientId,
            String templateId,
            String name,
            String goal,
            String startDate,
            String endDate,
            String status,
            long createdAt,
            long updatedAt
    ) {}

    /**
     * One client on a copy of this template — the answer to "who is on this?"
     * and the row the *push an update* action is offered from.
     */
    public record AssignmentResponse(
            String programId,
            String clientId,
            String clientName,
            String programName,
            String startDate,
            String endDate,
            String status,
            long createdAt,
            long updatedAt,
            /*
             * Whether this copy has fallen behind the blueprint it came from.
             *
             * A copy IS a copy — editing the template never rewrites it, which
             * is the whole point of the two tables — so "behind" is not an error
             * state and nothing is repaired automatically. It is the fact the
             * trainer needs in order to decide whether to push the change, which
             * `POST /v1/programs/{id}/resync` does and only ever does when
             * asked.
             */
            boolean behindTemplate,
            /**
             * V2 · WHAT THIS COPY SAYS THAT THE BLUEPRINT DOES NOT — and
             * therefore what a push would delete.
             *
             * `behindTemplate` above is a clock and answers a different
             * question. It cannot tell a copy nobody has touched from one a
             * trainer rewrote for a shoulder injury three weeks ago, and
             * `POST /v1/programs/{id}/resync` replaces the whole prescription
             * either way — so the panel that offers the push was, until this
             * field, offering to destroy work it had no way to mention.
             *
             * Appended last, and null-safe by construction: a build that
             * predates it reads the ten fields it always read.
             */
            PlanDiff.Result divergence
    ) {}

    // ── List ──────────────────────────────────────────────────────────────────

    public List<TemplateResponse> list(UUID trainerId) {
        var rows = jdbc.queryForList("""
                SELECT t.id::text, t.name, t.goal, t.description, t.structure::text AS structure,
                       t.day_labels::text AS day_labels, t.weeks, t.training_days,
                       t.created_at, t.updated_at, t.source, t.copied_from_id::text AS copied_from_id,
                       t.copied_from_name, t.copied_from_updated_at,
                       COALESCE(a.total,  0) AS assigned_count,
                       COALESCE(a.active, 0) AS active_assigned_count
                FROM template t
                LEFT JOIN (
                    SELECT template_id,
                           COUNT(*)                                        AS total,
                           COUNT(*) FILTER (WHERE status = 'active')       AS active
                    FROM program
                    WHERE deleted_at IS NULL AND template_id IS NOT NULL
                    GROUP BY template_id
                ) a ON a.template_id = t.id
                WHERE t.trainer_id = :tid::uuid AND t.deleted_at IS NULL
                -- FOUND BY RENDERING: two loads of the shelf, seconds apart,
                -- listed the six programs in two different orders. The seed
                -- stamped every row with an identical `updated_at`, and an
                -- ORDER BY with ties is free to return them in any order it
                -- likes. A shelf a trainer picks from by POSITION as much as by
                -- name cannot reshuffle between visits, so the sort is total:
                -- most recently touched, then oldest first, then the id, which
                -- nothing can tie on.
                ORDER BY t.updated_at DESC, t.created_at ASC, t.id
                """, Map.of("tid", trainerId.toString()));
        var samples = assignedSample(trainerId, rows.stream().map(r -> str(r.get("id"))).toList());
        return rows.stream()
                .map(r -> toResponse(r, samples.getOrDefault(str(r.get("id")), List.of())))
                .toList();
    }

    // ── Create ────────────────────────────────────────────────────────────────

    @Transactional
    public TemplateResponse create(UUID trainerId, CreateTemplateRequest req) {
        UUID id = UUID.randomUUID();
        Instant now = Instant.now();

        var p = new HashMap<String, Object>();
        p.put("id",           id.toString());
        p.put("tid",          trainerId.toString());
        p.put("name",         req.name());
        p.put("goal",         req.goal());
        p.put("description",  req.description());
        p.put("structure",    toJsonString(normalised(req.exercises())));
        p.put("dayLabels",    toJsonObject(req.dayLabels()));
        p.put("weeks",        normaliseWeeks(req.weeks()));
        p.put("trainingDays", trainingDaysCsv(req.trainingDays()));
        p.put("now",          Timestamp.from(now));

        jdbc.update("""
                INSERT INTO template (id, trainer_id, name, goal, description, structure, day_labels,
                    weeks, training_days, created_at, updated_at)
                VALUES (:id::uuid, :tid::uuid, :name, :goal, :description,
                    CAST(:structure AS jsonb), CAST(:dayLabels AS jsonb),
                    :weeks, :trainingDays, :now, :now)
                """, p);

        return get(id, trainerId);
    }

    // ── Get ───────────────────────────────────────────────────────────────────

    public TemplateResponse get(UUID id, UUID trainerId) {
        var row = findOwned(id, trainerId);
        return toResponse(row, assignedSample(trainerId, List.of(id.toString()))
                .getOrDefault(id.toString(), List.of()));
    }

    // ── Update ────────────────────────────────────────────────────────────────

    @Transactional
    public TemplateResponse update(UUID id, UUID trainerId, UpdateTemplateRequest req) {
        refuseCertified(id, false);
        findOwned(id, trainerId);

        var sets = new ArrayList<String>();
        var p = new HashMap<String, Object>();
        p.put("id",  id.toString());
        p.put("tid", trainerId.toString());
        p.put("now", Timestamp.from(Instant.now()));
        sets.add("updated_at = :now");

        if (req.name() != null)        { p.put("name",      req.name());        sets.add("name = :name"); }
        if (req.goal() != null)        { p.put("goal",      req.goal());        sets.add("goal = :goal"); }
        if (req.description() != null) { p.put("desc",      req.description()); sets.add("description = :desc"); }
        if (req.exercises() != null)   { p.put("structure", toJsonString(normalised(req.exercises())));
                                         sets.add("structure = CAST(:structure AS jsonb)"); }
        if (req.dayLabels() != null)   { p.put("dayLabels", toJsonObject(req.dayLabels()));
                                         sets.add("day_labels = CAST(:dayLabels AS jsonb)"); }
        if (req.weeks() != null)       { p.put("weeks",     normaliseWeeks(req.weeks()));
                                         sets.add("weeks = :weeks"); }
        if (req.trainingDays() != null){ p.put("trainingDays", trainingDaysCsv(req.trainingDays()));
                                         sets.add("training_days = :trainingDays"); }

        jdbc.update("UPDATE template SET " + String.join(", ", sets) +
                    " WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL", p);

        return get(id, trainerId);
    }

    // ── Delete ────────────────────────────────────────────────────────────────

    @Transactional
    public void delete(UUID id, UUID trainerId) {
        refuseCertified(id, false);
        findOwned(id, trainerId);
        jdbc.update("""
                UPDATE template SET deleted_at = NOW(), updated_at = NOW()
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("id", id.toString(), "tid", trainerId.toString()));
    }

    /**
     * V11 · write a trainer-owned template that is a copy of a certified one.
     * The blueprint arrives already resolved to this database's exercise ids
     * and is stored as given; the provenance is frozen as at this moment.
     */
    @Transactional
    public TemplateResponse insertCopy(UUID trainerId, String name, String goal, String description,
                                       String structureJson, String dayLabelsJson, Object weeks,
                                       Object trainingDays, CopiedFrom from) {
        UUID id = UUID.randomUUID();
        var p = new HashMap<String, Object>();
        p.put("id",           id.toString());
        p.put("tid",          trainerId.toString());
        p.put("name",         name);
        p.put("goal",         goal);
        p.put("description",  description);
        p.put("structure",    structureJson);
        p.put("dayLabels",    dayLabelsJson);
        p.put("weeks",        weeks);
        p.put("trainingDays", trainingDays);
        p.put("fromId",       from.id());
        p.put("fromName",     from.name());
        p.put("fromAt",       from.updatedAt() == null ? null : Timestamp.from(Instant.ofEpochMilli(from.updatedAt())));
        p.put("now",          Timestamp.from(Instant.now()));
        jdbc.update("""
                INSERT INTO template (id, trainer_id, name, goal, description, structure, day_labels,
                    weeks, training_days, source, copied_from_id, copied_from_name,
                    copied_from_updated_at, created_at, updated_at)
                VALUES (:id::uuid, :tid::uuid, :name, :goal, :description,
                    CAST(:structure AS jsonb), CAST(:dayLabels AS jsonb), :weeks, :trainingDays,
                    'own', :fromId::uuid, :fromName, :fromAt, :now, :now)
                """, p);
        return get(id, trainerId);
    }

    // ── Duplicate ─────────────────────────────────────────────────────────────

    /**
     * The most-used action on the shelf, and the reason the shelf exists.
     *
     * Trainers build one good program and tweak it per client; a blueprint that
     * can only be edited in place is one they will not touch, because six
     * clients are already on it. So this is a route rather than a
     * read-then-write in the browser: one round trip, the structure copied as
     * stored — every key in it, including keys this build does not know about,
     * which matters the day the phone adds one — and a name that says what
     * happened.
     *
     * What is deliberately NOT copied is the assignment count. A copy is a new
     * blueprint with nobody on it, which is exactly what makes it safe to edit.
     */
    @Transactional
    public TemplateResponse duplicate(UUID id, UUID trainerId, String nameOverride) {
        var source = findOwned(id, trainerId);
        UUID newId = UUID.randomUUID();
        Instant now = Instant.now();

        String name = nameOverride != null && !nameOverride.isBlank()
                ? nameOverride.trim()
                : nextCopyName(trainerId, str(source.get("name")));

        var p = new HashMap<String, Object>();
        p.put("id",           newId.toString());
        p.put("tid",          trainerId.toString());
        p.put("name",         name);
        p.put("goal",         source.get("goal"));
        p.put("description",  source.get("description"));
        // The blob as stored, not as parsed. A round trip through the DTO would
        // silently drop any key this build has no field for, which is precisely
        // the failure the additive-only law exists to prevent.
        p.put("structure",    str(source.get("structure")));
        p.put("dayLabels",    str(source.get("day_labels")));
        p.put("weeks",        source.get("weeks"));
        p.put("trainingDays", source.get("training_days"));
        p.put("now",          Timestamp.from(now));

        jdbc.update("""
                INSERT INTO template (id, trainer_id, name, goal, description, structure, day_labels,
                    weeks, training_days, created_at, updated_at)
                VALUES (:id::uuid, :tid::uuid, :name, :goal, :description,
                    CAST(:structure AS jsonb), CAST(:dayLabels AS jsonb),
                    :weeks, :trainingDays, :now, :now)
                """, p);

        return get(newId, trainerId);
    }

    /**
     * "Push / Pull / Legs" → "Push / Pull / Legs (copy)", then "(copy 2)".
     *
     * Numbered rather than allowed to collide, because the shelf is chosen from
     * by name and two rows reading the same thing is the one state that makes
     * duplicate-and-tweak dangerous instead of fast. Capped at the column's 150
     * characters, and the suffix is what survives a truncation — a name that
     * loses its "(copy 2)" is the collision this exists to avoid.
     */
    private String nextCopyName(UUID trainerId, String base) {
        var taken = new HashSet<>(jdbc.queryForList(
                "SELECT name FROM template WHERE trainer_id = :tid::uuid AND deleted_at IS NULL",
                Map.of("tid", trainerId.toString()), String.class));

        for (int n = 1; n <= 99; n++) {
            String suffix = n == 1 ? " (copy)" : " (copy " + n + ")";
            String head = base == null ? "Untitled" : base;
            if (head.length() + suffix.length() > 150) {
                head = head.substring(0, 150 - suffix.length());
            }
            String candidate = head + suffix;
            if (!taken.contains(candidate)) return candidate;
        }
        return UUID.randomUUID().toString().substring(0, 8);
    }

    // ── Assignments ───────────────────────────────────────────────────────────

    /**
     * Who is on a copy of this template, and which copies have fallen behind it.
     *
     * `behindTemplate` compares the program's own `updated_at` against the
     * template's. It is a heuristic and it is the honest one available: there is
     * no content hash on either side, and a copy that was edited per client is
     * *supposed* to differ. Read it as "the blueprint has moved since this copy
     * last did", which is the question the trainer is actually asking before
     * they press *Push the update*.
     */
    public List<AssignmentResponse> assignments(UUID templateId, UUID trainerId) {
        var tmpl = findOwned(templateId, trainerId);
        long templateUpdated = toEpochMilli(tmpl.get("updated_at"));
        var blueprint = parseStructure(str(tmpl.get("structure")));
        Object tw = tmpl.get("weeks");
        Integer templateWeeks = tw == null ? null : ((Number) tw).intValue();

        var rows = jdbc.queryForList("""
                SELECT p.id::text AS program_id, p.client_id::text, c.name AS client_name,
                       p.name AS program_name, p.start_date::text, p.end_date::text, p.status,
                       p.created_at, p.updated_at, p.synced_at, p.schedule::text AS schedule,
                       p.day_labels::text AS day_labels, p.weeks
                FROM program p
                JOIN client c ON c.id = p.client_id
                WHERE p.template_id = :tmpl::uuid AND p.trainer_id = :tid::uuid AND p.deleted_at IS NULL
                ORDER BY (p.status = 'active') DESC, p.created_at DESC
                """, Map.of("tmpl", templateId.toString(), "tid", trainerId.toString()));

        /* One read for every name either side of every diff, and none at all
           for a blueprint nobody is on. */
        var names = rows.isEmpty() ? Map.<String, String>of() : exerciseNames(templateId, trainerId);

        return rows.stream().map(r -> new AssignmentResponse(
                str(r.get("program_id")),
                str(r.get("client_id")),
                str(r.get("client_name")),
                str(r.get("program_name")),
                str(r.get("start_date")),
                str(r.get("end_date")),
                str(r.get("status")),
                toEpochMilli(r.get("created_at")),
                toEpochMilli(r.get("updated_at")),
                /* `synced_at` AND NOT `updated_at`, since V2. A copy the trainer
                   tuned this morning has a newer `updated_at` than a blueprint
                   edited yesterday and has still never received it — the read
                   this used to make said the opposite. `created_at` is the
                   fallback for a row written before the backfill, which is the
                   same moment the backfill would have chosen. */
                (r.get("synced_at") == null
                        ? toEpochMilli(r.get("created_at"))
                        : toEpochMilli(r.get("synced_at"))) < templateUpdated,
                divergenceOf(str(r.get("program_id")), blueprint, templateWeeks,
                             str(r.get("schedule")), str(r.get("day_labels")),
                             r.get("weeks") == null ? null : ((Number) r.get("weeks")).intValue(),
                             names)
        )).toList();
    }

    /**
     * One copy against the blueprint, for the push panel — see {@link PlanDiff}.
     *
     * <p>Read per assignment rather than in one join, deliberately: the rows of
     * thirteen prescriptions are thirteen small indexed reads on one column, and
     * the alternative is a join whose grouping this method would then have to
     * undo. A template with nobody on it makes none of them.
     */
    private PlanDiff.Result divergenceOf(String programId,
                                         List<TemplateExerciseResponse> blueprint,
                                         Integer templateWeeks,
                                         String scheduleJson,
                                         String dayLabelsJson,
                                         Integer programWeeks,
                                         Map<String, String> names) {
        var copy = jdbc.queryForList("""
                SELECT exercise_id::text, day_of_week, week, order_index, sets, reps,
                       duration_seconds, rest_seconds, target_load, tempo, notes,
                       alt_exercise_id::text, set_detail::text AS set_detail
                FROM program_exercise
                WHERE program_id = :pid::uuid AND deleted_at IS NULL
                ORDER BY COALESCE(week, 1), COALESCE(day_of_week, 999), order_index ASC
                """, Map.of("pid", programId)).stream().map(this::toDiffRow).toList();

        var bySlot = new HashMap<Integer, ScheduleEntry>();
        for (var e : parseSchedule(scheduleJson)) bySlot.put(e.day(), e);

        var base = blueprint.stream().map(e -> new PlanDiff.Row(
                e.exerciseId(), e.dayOfWeek(), e.week(), e.orderIndex(), e.sets(), e.reps(),
                e.durationSeconds(), e.restSeconds(),
                e.targetLoad() == null ? null : java.math.BigDecimal.valueOf(e.targetLoad()),
                e.tempo(), e.notes(), e.altExerciseId(), e.setDetail())).toList();

        return PlanDiff.between(base, copy, bySlot, templateWeeks, programWeeks,
                parseDayLabels(dayLabelsJson),
                id -> names.getOrDefault(id, "an exercise"));
    }

    private PlanDiff.Row toDiffRow(Map<String, Object> r) {
        Object tl = r.get("target_load");
        Object oi = r.get("order_index");
        return new PlanDiff.Row(
                str(r.get("exercise_id")),
                num(r.get("day_of_week")), num(r.get("week")),
                oi == null ? 0 : ((Number) oi).intValue(),
                num(r.get("sets")), num(r.get("reps")),
                num(r.get("duration_seconds")), num(r.get("rest_seconds")),
                tl instanceof java.math.BigDecimal bd ? bd
                        : (tl == null ? null : new java.math.BigDecimal(tl.toString())),
                str(r.get("tempo")), str(r.get("notes")), str(r.get("alt_exercise_id")),
                parseSetDetail(str(r.get("set_detail"))));
    }

    private Integer num(Object v) { return v == null ? null : ((Number) v).intValue(); }

    /**
     * Names for every movement either side of the diff mentions, in one read.
     *
     * Scoped to the caller's own library plus the global one, the same way every
     * other exercise read on this service is — a diff line naming an exercise
     * the trainer cannot see would be a disclosure through a sentence.
     */
    private Map<String, String> exerciseNames(UUID templateId, UUID trainerId) {
        var rows = jdbc.queryForList("""
                SELECT DISTINCT e.id::text AS id, e.name
                FROM exercise e
                WHERE e.deleted_at IS NULL
                  AND (e.trainer_id IS NULL OR e.trainer_id = :tid::uuid)
                  AND (e.id IN (SELECT pe.exercise_id FROM program_exercise pe
                                JOIN program p ON p.id = pe.program_id
                                WHERE p.template_id = :tmpl::uuid AND p.trainer_id = :tid::uuid
                                  AND pe.deleted_at IS NULL)
                    OR e.id IN (SELECT pe.alt_exercise_id FROM program_exercise pe
                                JOIN program p ON p.id = pe.program_id
                                WHERE p.template_id = :tmpl::uuid AND p.trainer_id = :tid::uuid
                                  AND pe.deleted_at IS NULL AND pe.alt_exercise_id IS NOT NULL)
                    OR e.id::text IN (SELECT jsonb_array_elements(t.structure) ->> 'exercise_id'
                                      FROM template t WHERE t.id = :tmpl::uuid))
                """, Map.of("tmpl", templateId.toString(), "tid", trainerId.toString()));
        var out = new HashMap<String, String>();
        for (var r : rows) out.put(str(r.get("id")), str(r.get("name")));
        return out;
    }

    /** The client's chosen layout, as `apply` wrote it. */
    public List<ScheduleEntry> parseSchedule(String json) {
        if (json == null || json.isBlank() || json.equals("null")) return List.of();
        try {
            return STORE.readValue(json, new TypeReference<List<ScheduleEntry>>() {});
        } catch (Exception e) {
            log.warn("Unreadable program schedule: {}", e.getMessage());
            return List.of();
        }
    }

    private List<SetDetail> parseSetDetail(String json) {
        if (json == null || json.isBlank() || json.equals("null")) return null;
        try {
            var out = STORE.readValue(json, new TypeReference<List<SetDetail>>() {});
            return out.isEmpty() ? null : out;
        } catch (Exception e) {
            return null;
        }
    }

    // ── Apply → creates an independent per-client program ─────────────────────

    /**
     * A template's day numbers are ordinal slots ("Day 1".."Day 7"), not
     * weekdays. Which weekday each slot lands on is the client's preference,
     * carried in `req.schedule` — so the copy below is also the translation:
     * the client's `program_exercise` rows get the concrete weekday, which is
     * what the phone's log and diary key on. The schedule must cover exactly
     * the days the template has, or the apply is refused; a plan silently
     * missing a day, or with a day nobody scheduled, is worse than an error.
     *
     * <p>And the copy is a SNAPSHOT. Every row below is a new row on the
     * client's side, and nothing in this method or any other reaches back
     * through `program.template_id` to rewrite it. Editing a blueprint after it
     * has been assigned changes the blueprint and nothing else — which is what
     * makes duplicate-and-tweak safe, and what
     * `POST /v1/programs/{id}/resync` exists to override, once, on request.
     */
    @Transactional
    public ProgramSummary apply(UUID templateId, UUID trainerId, ApplyTemplateRequest req) {
        refuseCertified(templateId, true);
        var tmpl = findOwned(templateId, trainerId);

        Boolean owned = jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM client WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)",
                Map.of("cid", req.clientId(), "tid", trainerId.toString()), Boolean.class);
        if (!Boolean.TRUE.equals(owned)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Client not found");
        }

        var blueprint = parseStructure(str(tmpl.get("structure")));

        // The day slots this template actually has: the laid-out days plus any
        // day an exercise already sits on — the same union the app draws.
        var slots = new TreeSet<>(parseTrainingDaysCsv(str(tmpl.get("training_days"))));
        for (var ex : blueprint) {
            if (ex.dayOfWeek() != null && ex.dayOfWeek() >= 1 && ex.dayOfWeek() <= 7) {
                slots.add(ex.dayOfWeek());
            }
        }

        /* NO SCHEDULE SENT: THE CLIENT'S OWN WEEK IS THE SCHEDULE.
           The redesigned add-a-client flow agrees the days on step 3 and then
           applies the plan with just `{clientId}` — the days are already on the
           client, and asking again would be the same question twice. So a
           missing schedule is DERIVED by position from `client.weekly_schedule`
           (the web's old `pairSchedule`, now the server's), and the rest of apply
           runs exactly as if it had been sent. An explicit schedule still wins. */
        List<ScheduleEntry> schedule = req.schedule();
        if ((schedule == null || schedule.isEmpty()) && !slots.isEmpty()) {
            schedule = scheduleFromStandingWeek(req.clientId(), trainerId.toString(), slots);
        }
        Map<Integer, ScheduleEntry> bySlot = validateSchedule(schedule, slots);

        UUID programId = UUID.randomUUID();
        Instant now = Instant.now();
        String programName = req.name() != null && !req.name().isBlank()
                ? req.name() : str(tmpl.get("name"));
        String goal = req.goal() != null ? req.goal() : str(tmpl.get("goal"));
        Date startDate = req.startDate() != null ? new Date(req.startDate()) : null;
        Date endDate   = req.endDate()   != null ? new Date(req.endDate())   : null;

        var p = new HashMap<String, Object>();
        p.put("id",        programId.toString());
        p.put("tid",       trainerId.toString());
        p.put("cid",       req.clientId());
        p.put("tmplId",    templateId.toString());
        p.put("name",      programName);
        p.put("goal",      goal);
        p.put("startDate", startDate);
        p.put("endDate",   endDate);
        p.put("schedule",  schedule == null || schedule.isEmpty()
                ? null : toJsonString(schedule));
        p.put("now",       Timestamp.from(now));

        /* V2 · THE SHAPE COMES ACROSS WITH THE ROWS, because the copy is going
           to be edited. Translated into this client's week by `shapeFor`, which
           carries the argument — and `synced_at` is stamped here because apply
           is one of the two moments a copy TAKES the blueprint. */
        var shape = shapeFor(templateId, trainerId, bySlot);
        p.put("dayLabels",    toJsonString(shape.dayLabels()));
        p.put("weeks",        shape.weeks());
        p.put("trainingDays", dayCsv(shape.trainingDays()));

        /* ONE LIVE PLAN PER CLIENT, BUT ONLY THE CALLER'S.
           Apply used to leave the previous plan `active`, so a client re-planned
           twice had two, and every screen reading "the active program" drew
           whichever came back first. The older ones are closed here, in the same
           transaction as the new copy: `completed`, with an end date of today
           unless they had already ended earlier. Scoped by `trainer_id` — a team
           widens reads and never moves ownership, so a teammate's plan on a
           reassigned client is not this caller's to end. */
        jdbc.update("""
                UPDATE program
                SET status     = 'completed',
                    end_date   = LEAST(COALESCE(end_date, :today), :today),
                    updated_at = :now
                WHERE client_id = :cid::uuid AND trainer_id = :tid::uuid
                  AND status = 'active' AND deleted_at IS NULL
                """, Map.of("cid", req.clientId(), "tid", trainerId.toString(),
                            "today", java.sql.Date.valueOf(java.time.LocalDate.now(IST)),
                            "now", Timestamp.from(now)));

        jdbc.update("""
                INSERT INTO program (id, trainer_id, client_id, template_id, name, goal,
                    start_date, end_date, schedule, status, created_at, updated_at,
                    day_labels, weeks, training_days, synced_at)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, :tmplId::uuid, :name, :goal,
                    :startDate, :endDate, CAST(:schedule AS jsonb), 'active', :now, :now,
                    CAST(:dayLabels AS jsonb), :weeks, :trainingDays, :now)
                """, p);

        copyBlueprintInto(programId, blueprint, bySlot, now);

        /* ── AND THE CLIENT'S WEEK, AND THE DIARY ON IT · V3 ───────────────────

           The mapping this panel makes — "Day 1 is this client's Monday 6am" — is
           the same fact `client.weekly_schedule` holds, and it was being written
           to `program.schedule` only. So a trainer who set the days here and a
           trainer who set them in the add-a-client flow were filling two
           different columns with one answer, and whichever screen read the other
           one found nothing.

           Writing it to both makes the rhythm survive the plan: a client stays on
           their Tuesdays when this block ends and the next one is assigned, and
           the sessions their pack already booked get this plan's names rather
           than a second set of bookings on top.

           `reconcile` is the join. Where the schedule moved a day, the diary moves
           with it; where it did not, the rows are kept and re-labelled. Same
           transaction as the copy — a plan whose sessions failed to land is worse
           than no plan. */
        writeStandingWeek(req.clientId(), trainerId.toString(), bySlot);
        diary.reconcile(trainerId, req.clientId());

        return new ProgramSummary(
                programId.toString(), req.clientId(), templateId.toString(),
                programName, goal,
                startDate != null ? startDate.toString() : null,
                endDate   != null ? endDate.toString()   : null,
                "active", now.toEpochMilli(), now.toEpochMilli());
    }

    /**
     * The schedule the panel chose, onto the client it is for.
     *
     * <p>Same shape and same weekday convention as {@code program.schedule} — 1 =
     * Monday … 7 = Sunday, which {@link #validateSchedule} has already enforced on
     * the way in, so nothing here can produce a day outside it.
     *
     * <p>{@code templateDay} carries the template's ORDINAL slot rather than the
     * client's position, deliberately: the phone's plan screens read a slot's
     * ordinal off this column, and renumbering to 1..n here would turn a plan
     * whose days are 2 and 4 into one whose days are 1 and 2.
     * {@code SessionPlanner.parseSlots} keeps whatever ordinal it is given and
     * only fills in a missing one.
     */
    /**
     * The client's standing week, paired with the template's days BY POSITION —
     * the k-th slot of their week (by weekday, then time) takes the template's
     * k-th training day. Exactly the rule the web's `pairSchedule` applied before
     * it moved here, so a plan applied from either path lands the same way.
     *
     * <p>A count that does not match is refused with {@code SCHEDULE_MISMATCH}
     * and a sentence that names both numbers, rather than quietly dropping a
     * day or leaving one unscheduled: the trainer has to choose which day goes.
     */
    private List<ScheduleEntry> scheduleFromStandingWeek(String clientId, String tid, Set<Integer> slots) {
        String json = jdbc.queryForObject("""
                SELECT weekly_schedule::text FROM client
                WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("cid", clientId, "tid", tid), String.class);
        List<Map<String, Object>> raw;
        try {
            raw = json == null ? List.of() : STORE.readValue(json, new TypeReference<>() {});
        } catch (Exception e) {
            raw = List.of();
        }
        var week = SessionPlanner.parseSlots(raw).stream()
                .sorted(Comparator.comparingInt(SessionPlanner.Slot::weekday)
                        .thenComparing(SessionPlanner.Slot::time))
                .toList();
        if (week.isEmpty()) {
            throw ProgramRuleException.scheduleMismatch(
                    "This client has no training days agreed yet. Choose the days for this plan, "
                            + "or set their week on their file first.");
        }
        if (week.size() != slots.size()) {
            throw ProgramRuleException.scheduleMismatch(
                    "This program trains %d day%s a week and this client trains %d. Choose which days it goes on."
                            .formatted(slots.size(), slots.size() == 1 ? "" : "s", week.size()));
        }
        var ordinals = new ArrayList<>(new TreeSet<>(slots));
        var out = new ArrayList<ScheduleEntry>(week.size());
        for (int k = 0; k < week.size(); k++) {
            out.add(new ScheduleEntry(ordinals.get(k), week.get(k).weekday(), week.get(k).time()));
        }
        return out;
    }

    private void writeStandingWeek(String clientId, String tid, Map<Integer, ScheduleEntry> bySlot) {
        if (bySlot.isEmpty()) return;
        var week = bySlot.entrySet().stream()
                .sorted(Comparator.comparingInt(e -> e.getValue().weekday()))
                .map(e -> Map.<String, Object>of("templateDay", e.getKey(),
                                                 "weekday", e.getValue().weekday(),
                                                 "time", e.getValue().time()))
                .toList();
        jdbc.update("""
                UPDATE client
                SET weekly_schedule   = CAST(:week AS jsonb),
                    sessions_per_week = :perWeek,
                    updated_at        = NOW()
                WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("week", toJsonString(week),
                            "perWeek", week.size(),
                            "cid", clientId,
                            "tid", tid));
    }

    /**
     * The copy itself, shared by {@code apply} and by the resync on
     * {@code ProgramService}, so a blueprint pushed to an existing client lands
     * exactly as one applied to a new client does. Two implementations of this
     * translation would be two answers to "what does this template mean".
     */
    public void copyBlueprintInto(UUID programId,
                           List<TemplateExerciseResponse> blueprint,
                           Map<Integer, ScheduleEntry> bySlot,
                           Instant now) {
        // A superset's group id is minted per PROGRAM, not carried from the
        // blueprint: two clients on the same template must not share a
        // correlation id, or a query for "the rows in this group" crosses
        // between two people's plans.
        var groups = new HashMap<String, String>();

        for (var ex : blueprint) {
            var ep = new HashMap<String, Object>();
            ep.put("id",              UUID.randomUUID().toString());
            ep.put("programId",       programId.toString());
            ep.put("exerciseId",      ex.exerciseId());
            ep.put("sets",            ex.sets());
            ep.put("reps",            ex.reps());
            ep.put("restSeconds",     ex.restSeconds());
            // V25. A timed prescription — "3 × 45s" — carried instead of reps.
            ep.put("durationSeconds", ex.durationSeconds());
            ep.put("targetLoad",      ex.targetLoad());
            ep.put("notes",           ex.notes());
            // V31.
            ep.put("tempo",           ex.tempo());
            ep.put("altExerciseId",   ex.altExerciseId());
            ep.put("groupId",         ex.groupId() == null ? null
                    : groups.computeIfAbsent(ex.groupId(), k -> UUID.randomUUID().toString()));
            ep.put("setDetail",       ex.setDetail() == null || ex.setDetail().isEmpty()
                    ? null : toJsonString(ex.setDetail()));
            // The translation: ordinal template day → the weekday the client
            // chose for it. Validation guarantees every day the blueprint uses
            // has a mapping; an entry with no day at all stays day-less.
            Integer slot = ex.dayOfWeek();
            ScheduleEntry landing = slot == null ? null : bySlot.get(slot);
            ep.put("dayOfWeek",       landing == null ? null : landing.weekday());
            ep.put("orderIndex",      ex.orderIndex());
            // V20. A blueprint entry that predates multi-week programs has no
            // week on it and means week 1 — copying it as NULL would be the
            // same thing, but writing the 1 makes the client's plan explicit
            // about a shape the trainer can now see week by week.
            ep.put("week",            ex.week() == null ? 1 : ex.week());
            // V10 · the block survives the copy. Carried as-is, unlike the
            // group id above: it is a board handle, not a correlation id a
            // query joins on, so two clients sharing one crosses nothing.
            ep.put("workoutId",       clip(ex.workoutId(), MAX_WORKOUT_ID));
            ep.put("workoutName",     clip(ex.workoutName(), MAX_WORKOUT_NAME));
            ep.put("now",             Timestamp.from(now));

            jdbc.update("""
                    INSERT INTO program_exercise (id, program_id, exercise_id, sets, reps,
                        rest_seconds, duration_seconds, target_load, notes, day_of_week, week,
                        order_index, tempo, alt_exercise_id, group_id, set_detail,
                        workout_id, workout_name, created_at, updated_at)
                    VALUES (:id::uuid, :programId::uuid, :exerciseId::uuid, :sets, :reps,
                        :restSeconds, :durationSeconds, :targetLoad, :notes, :dayOfWeek, :week,
                        :orderIndex, :tempo, :altExerciseId::uuid, :groupId::uuid,
                        CAST(:setDetail AS jsonb), :workoutId, :workoutName, :now, :now)
                    """, ep);
        }
    }

    /**
     * THE SHAPE A COPY TAKES, TRANSLATED INTO THE CLIENT'S OWN WEEK.
     *
     * `copyBlueprintInto` has translated the ROWS since V24 — a template's
     * ordinal "Day 2" becomes whatever weekday this client chose for it — and
     * V2 gives the copy the three shape columns to go with them. They have to be
     * translated the same way or they describe a week the rows do not sit in.
     *
     * Copying `day_labels` verbatim is the trap, and it is silent: a client on
     * Mon/Tue/Thu/Fri takes slots 1,2,3,4 onto weekdays 1,2,4,5, so the
     * blueprint's name for slot 3 would land on a Wednesday they never train
     * while their Thursday went unnamed. Every label is re-keyed through the
     * schedule they actually chose.
     *
     * `weeks` needs no translation: the length of a block is the same fact on
     * both sides of the copy.
     */
    public record ProgramShape(Map<String, String> dayLabels, Integer weeks, List<Integer> trainingDays) {}

    public ProgramShape shapeFor(UUID templateId, UUID trainerId, Map<Integer, ScheduleEntry> bySlot) {
        var tmpl = findOwned(templateId, trainerId);
        var slotLabels = parseDayLabels(str(tmpl.get("day_labels")));

        var labels = new LinkedHashMap<String, String>();
        var weekdays = new ArrayList<Integer>();
        for (var e : bySlot.entrySet()) {
            int weekday = e.getValue().weekday();
            weekdays.add(weekday);
            String label = slotLabels.get(String.valueOf(e.getKey()));
            if (label != null && !label.isBlank()) labels.put(String.valueOf(weekday), label);
        }
        Object w = tmpl.get("weeks");
        return new ProgramShape(labels, w == null ? null : ((Number) w).intValue(), weekdays);
    }

    /**
     * The blueprint and the day mapping a resync needs, read through the same
     * owner check every other route on this service runs.
     */
    public record Blueprint(List<TemplateExerciseResponse> entries, Set<Integer> slots) {}

    public Blueprint blueprintOf(UUID templateId, UUID trainerId) {
        var tmpl = findOwned(templateId, trainerId);
        var entries = parseStructure(str(tmpl.get("structure")));
        var slots = new TreeSet<>(parseTrainingDaysCsv(str(tmpl.get("training_days"))));
        for (var ex : entries) {
            if (ex.dayOfWeek() != null && ex.dayOfWeek() >= 1 && ex.dayOfWeek() <= 7) {
                slots.add(ex.dayOfWeek());
            }
        }
        return new Blueprint(entries, slots);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Map<String, Object> findOwned(UUID id, UUID trainerId) {
        var rows = jdbc.queryForList("""
                SELECT t.id::text, t.name, t.goal, t.description, t.structure::text AS structure,
                       t.day_labels::text AS day_labels, t.weeks, t.training_days,
                       t.created_at, t.updated_at, t.source, t.copied_from_id::text AS copied_from_id,
                       t.copied_from_name, t.copied_from_updated_at,
                       COALESCE(a.total,  0) AS assigned_count,
                       COALESCE(a.active, 0) AS active_assigned_count
                FROM template t
                LEFT JOIN (
                    SELECT template_id,
                           COUNT(*)                                  AS total,
                           COUNT(*) FILTER (WHERE status = 'active') AS active
                    FROM program
                    WHERE deleted_at IS NULL AND template_id IS NOT NULL
                    GROUP BY template_id
                ) a ON a.template_id = t.id
                WHERE t.id = :id::uuid AND t.trainer_id = :tid::uuid AND t.deleted_at IS NULL
                """, Map.of("id", id.toString(), "tid", trainerId.toString()));
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Template not found");
        return rows.get(0);
    }

    /**
     * "1,2,3" → {1,2,3}. Junk and out-of-range values are dropped, not thrown.
     *
     * PUBLIC since V2, because `program.training_days` uses the identical
     * encoding for a different meaning — the WEEKDAYS one client trains, where
     * a template's are ordinal slots. One parser, so the two columns cannot
     * drift into two dialects of the same CSV.
     */
    public List<Integer> parseDayCsv(String csv) {
        return List.copyOf(parseTrainingDaysCsv(csv));
    }

    /** {3,1,2} → "1,2,3", shared with `program.training_days` for the reason
     *  above. */
    public String dayCsv(List<Integer> days) {
        return trainingDaysCsv(days);
    }

    private Set<Integer> parseTrainingDaysCsv(String csv) {
        if (csv == null || csv.isBlank()) return Set.of();
        var out = new TreeSet<Integer>();
        for (String part : csv.split(",")) {
            try {
                int day = Integer.parseInt(part.trim());
                if (day >= 1 && day <= 7) out.add(day);
            } catch (NumberFormatException ignored) { /* not a day */ }
        }
        return out;
    }

    /** {3,1,2} → "1,2,3". Sorted and de-duplicated so the column reads the same
     *  whichever order the builder happened to send its columns in. */
    private String trainingDaysCsv(List<Integer> days) {
        if (days == null) return null;
        var clean = new TreeSet<Integer>();
        for (Integer d : days) if (d != null && d >= 1 && d <= 7) clean.add(d);
        return clean.isEmpty() ? "" : String.join(",", clean.stream().map(String::valueOf).toList());
    }

    /** A program runs at least one week and at most a year of them. */
    private Integer normaliseWeeks(Integer weeks) {
        if (weeks == null) return null;
        return Math.max(1, Math.min(52, weeks));
    }

    private static final java.util.regex.Pattern HHMM =
            java.util.regex.Pattern.compile("^([01]\\d|2[0-3]):[0-5]\\d$");

    /**
     * The count-match rule: the schedule must name exactly the template's day
     * slots — every slot placed on a distinct weekday, at a well-formed time.
     * Anything else is a 400 that says what to fix, because the alternative is
     * a client's plan with a day that never happens.
     */
    private Map<Integer, ScheduleEntry> validateSchedule(List<ScheduleEntry> schedule, Set<Integer> slots) {
        int given = schedule == null ? 0 : schedule.size();
        if (given != slots.size()) {
            throw ProgramRuleException.scheduleMismatch(
                    "This program trains %d day%s a week — schedule exactly %d weekday%s for it (got %d)."
                            .formatted(slots.size(), slots.size() == 1 ? "" : "s",
                                       slots.size(), slots.size() == 1 ? "" : "s", given));
        }
        if (slots.isEmpty()) return Map.of();

        var bySlot = new HashMap<Integer, ScheduleEntry>();
        var weekdays = new HashSet<Integer>();
        for (ScheduleEntry entry : schedule) {
            if (!slots.contains(entry.day()) || bySlot.put(entry.day(), entry) != null) {
                throw ProgramRuleException.scheduleMismatch(
                        "The schedule must cover each of this program's days exactly once.");
            }
            if (entry.weekday() < 1 || entry.weekday() > 7 || !weekdays.add(entry.weekday())) {
                throw ProgramRuleException.scheduleInvalid(
                        "Each day needs its own weekday, Monday (1) through Sunday (7).");
            }
            if (entry.time() == null || !HHMM.matcher(entry.time()).matches()) {
                throw ProgramRuleException.scheduleInvalid(
                        "Each day needs a time, as 24-hour HH:mm.");
            }
        }
        return bySlot;
    }

    private TemplateResponse toResponse(Map<String, Object> r) {
        return toResponse(r, List.of());
    }

    private TemplateResponse toResponse(Map<String, Object> r, List<AssignedClient> sample) {
        var entries = parseStructure(str(r.get("structure")));
        var days = new TreeSet<>(parseTrainingDaysCsv(str(r.get("training_days"))));
        // The union the app draws, and the reason `trainingDays` is a read the
        // caller can trust: a template authored before V24 has no CSV at all,
        // and its days are wherever its exercises sit.
        for (var ex : entries) {
            if (ex.dayOfWeek() != null && ex.dayOfWeek() >= 1 && ex.dayOfWeek() <= 7) {
                days.add(ex.dayOfWeek());
            }
        }
        return new TemplateResponse(
                str(r.get("id")),
                str(r.get("name")),
                str(r.get("goal")),
                str(r.get("description")),
                entries,
                parseDayLabels(str(r.get("day_labels"))),
                toEpochMilli(r.get("created_at")),
                toEpochMilli(r.get("updated_at")),
                r.get("weeks") instanceof Number n ? n.intValue() : null,
                List.copyOf(days),
                intOf(r.get("assigned_count")),
                intOf(r.get("active_assigned_count")),
                sample,
                r.get("source") == null ? "own" : str(r.get("source")),
                r.get("copied_from_id") == null && r.get("copied_from_name") == null ? null
                        : new CopiedFrom(str(r.get("copied_from_id")), str(r.get("copied_from_name")),
                                         r.get("copied_from_updated_at") == null ? null
                                                 : toEpochMilli(r.get("copied_from_updated_at"))));
    }

    /**
     * V11 · a certified program's id sent to a route that writes a TRAINER'S
     * template. Named rather than answered with a bare 404, because the id is
     * real and the trainer is one button away from the thing they meant.
     */
    private void refuseCertified(UUID id, boolean applying) {
        Boolean certified = jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM certified_template WHERE id = :id::uuid AND deleted_at IS NULL)",
                Map.of("id", id.toString()), Boolean.class);
        if (!Boolean.TRUE.equals(certified)) return;
        throw applying ? ProgramRuleException.certifiedCopyFirst() : ProgramRuleException.certifiedReadOnly();
    }

    /** The avatar cluster's cap — the most a shelf row draws before "+N". */
    static final int SAMPLE_SIZE = 6;

    /**
     * Up to {@link #SAMPLE_SIZE} clients on an ACTIVE copy of each template, in
     * ONE query for the whole shelf. Distinct per client (a client on two
     * active copies of one blueprint is one face), ordered by name then id so
     * the cluster is a total order and never reshuffles. Scoped to the caller's
     * own programs — see {@code TemplateResponse.assignedClients}.
     */
    private Map<String, List<AssignedClient>> assignedSample(UUID trainerId, List<String> templateIds) {
        if (templateIds.isEmpty()) return Map.of();
        var rows = jdbc.queryForList("""
                SELECT template_id, client_id, name FROM (
                    SELECT d.*, row_number() OVER (PARTITION BY d.template_id
                                                   ORDER BY d.name, d.client_id) AS rn
                    FROM (
                        SELECT DISTINCT p.template_id::text AS template_id,
                               c.id::text AS client_id, c.name
                        FROM program p
                        JOIN client c ON c.id = p.client_id AND c.deleted_at IS NULL
                        WHERE p.trainer_id = :tid::uuid AND p.status = 'active'
                          AND p.deleted_at IS NULL AND p.template_id::text IN (:ids)
                    ) d
                ) x
                WHERE rn <= :cap
                ORDER BY template_id, rn
                """, Map.of("tid", trainerId.toString(), "ids", templateIds, "cap", SAMPLE_SIZE));
        var out = new HashMap<String, List<AssignedClient>>();
        for (var r : rows) {
            out.computeIfAbsent(str(r.get("template_id")), k -> new ArrayList<>())
               .add(new AssignedClient(str(r.get("client_id")), str(r.get("name"))));
        }
        return out;
    }

    private List<TemplateExerciseInput> normalised(List<TemplateExerciseInput> in) {
        return in == null ? null : in.stream().map(e -> e == null ? null : e.normalised()).toList();
    }

    /**
     * Storage → wire, and deliberately tolerant of both casings.
     *
     * snake_case is what this service and the sync push write and what the
     * phone reads. camelCase turns up because `template.structure` is free JSON
     * that several builds have written over four months, and a blueprint the
     * server cannot read is a program the trainer watches vanish. So each field
     * is looked up under both names and the storage spelling wins.
     */
    public List<TemplateExerciseResponse> parseStructure(String json) {
        if (json == null || json.isBlank()) return List.of();
        List<Map<String, Object>> raw;
        try {
            var node = STORE.readTree(json);
            String arrayJson = node.isArray() ? json : node.path("exercises").toString();
            raw = STORE.readValue(arrayJson, new TypeReference<>() {});
        } catch (Exception e) {
            log.warn("Failed to parse template structure: {}", e.getMessage());
            return List.of();
        }

        var out = new ArrayList<TemplateExerciseResponse>(raw.size());
        for (int i = 0; i < raw.size(); i++) {
            var e = raw.get(i);
            if (e == null) continue;
            String exerciseId = text(e, "exercise_id", "exerciseId");
            // An entry with no exercise on it is not a row a builder can draw or
            // a client can train. Dropped rather than surfaced as a blank card.
            if (exerciseId == null || exerciseId.isBlank()) continue;
            out.add(new TemplateExerciseResponse(
                    exerciseId,
                    integer(e, "sets", "sets"),
                    integer(e, "reps", "reps"),
                    integer(e, "rest_seconds", "restSeconds"),
                    decimal(e, "target_load", "targetLoad"),
                    text(e, "notes", "notes"),
                    integer(e, "day_of_week", "dayOfWeek"),
                    Optional.ofNullable(integer(e, "order_index", "orderIndex")).orElse(i),
                    integer(e, "week", "week"),
                    integer(e, "duration_seconds", "durationSeconds"),
                    text(e, "tempo", "tempo"),
                    text(e, "alt_exercise_id", "altExerciseId"),
                    text(e, "group_id", "groupId"),
                    setDetail(e),
                    text(e, "workout_id", "workoutId"),
                    text(e, "workout_name", "workoutName")));
        }
        // week → day → position, so every caller gets the same order and no
        // caller has to sort. Matches `parseBlueprint` on the phone.
        out.sort(Comparator
                .comparingInt((TemplateExerciseResponse x) -> x.week() == null ? 1 : x.week())
                .thenComparingInt(x -> x.dayOfWeek() == null ? 99 : x.dayOfWeek())
                .thenComparingInt(TemplateExerciseResponse::orderIndex));
        return out;
    }

    @SuppressWarnings("unchecked")
    private List<SetDetail> setDetail(Map<String, Object> entry) {
        Object raw = entry.containsKey("set_detail") ? entry.get("set_detail") : entry.get("setDetail");
        if (!(raw instanceof List<?> list) || list.isEmpty()) return null;
        var out = new ArrayList<SetDetail>(list.size());
        for (Object item : list) {
            if (!(item instanceof Map<?, ?> m)) continue;
            var s = (Map<String, Object>) m;
            out.add(new SetDetail(
                    integer(s, "reps", "reps"),
                    integer(s, "duration_seconds", "durationSeconds"),
                    Boolean.TRUE.equals(s.containsKey("to_failure") ? s.get("to_failure") : s.get("toFailure"))));
        }
        return out.isEmpty() ? null : out;
    }

    private String text(Map<String, Object> e, String stored, String camel) {
        Object v = e.containsKey(stored) ? e.get(stored) : e.get(camel);
        if (v == null) return null;
        String s = v.toString();
        return s.isBlank() ? null : s;
    }

    private Integer integer(Map<String, Object> e, String stored, String camel) {
        Object v = e.containsKey(stored) ? e.get(stored) : e.get(camel);
        if (v instanceof Number n) return n.intValue();
        if (v instanceof String s && !s.isBlank()) {
            try { return Integer.valueOf(s.trim()); } catch (NumberFormatException ignored) { return null; }
        }
        return null;
    }

    private Double decimal(Map<String, Object> e, String stored, String camel) {
        Object v = e.containsKey(stored) ? e.get(stored) : e.get(camel);
        if (v instanceof Number n) return n.doubleValue();
        if (v instanceof String s && !s.isBlank()) {
            try { return Double.valueOf(s.trim()); } catch (NumberFormatException ignored) { return null; }
        }
        return null;
    }

    /** PUBLIC since V2: `shapeFor` re-keys these onto a client's weekdays, and
     *  `ProgramService` reads the copy's own set back the same way. Unreadable
     *  is no names rather than a failed read — a plan whose labels will not
     *  parse still has days in it. */
    public Map<String, String> parseDayLabels(String json) {
        if (json == null || json.isBlank() || json.equals("null") || json.equals("{}")) return Map.of();
        try {
            return STORE.readValue(json, new TypeReference<>() {});
        } catch (Exception e) {
            log.warn("Failed to parse day_labels: {}", e.getMessage());
            return Map.of();
        }
    }

    /** Always the SNAKE_CASE mapper — see the note on {@link #STORE}. */
    private String toJsonString(Object v) {
        if (v == null) return "[]";
        try { return STORE.writeValueAsString(v); }
        catch (JsonProcessingException e) { return "[]"; }
    }

    /**
     * The same, for a column that holds an OBJECT rather than a list.
     *
     * `day_labels` is `{"1":"Push"}` and `structure` is `[...]`, and one helper
     * defaulting to `[]` for both wrote an empty ARRAY into `day_labels` on
     * every template created without labels — which then failed to parse on
     * every subsequent read and logged a warning per request. Harmless in the
     * response, because the parser falls back to an empty map, and noisy enough
     * to hide a real one.
     */
    private String toJsonObject(Object v) {
        if (v == null) return "{}";
        try { return STORE.writeValueAsString(v); }
        catch (JsonProcessingException e) { return "{}"; }
    }

    private String str(Object v) { return v == null ? null : v.toString(); }

    private int intOf(Object v) { return v instanceof Number n ? n.intValue() : 0; }

    private long toEpochMilli(Object v) {
        if (v instanceof java.sql.Timestamp ts)          return ts.toInstant().toEpochMilli();
        if (v instanceof java.time.OffsetDateTime odt)   return odt.toInstant().toEpochMilli();
        if (v instanceof java.time.LocalDateTime ldt)    return ldt.toInstant(java.time.ZoneOffset.UTC).toEpochMilli();
        if (v instanceof java.time.Instant i)            return i.toEpochMilli();
        return 0L;
    }
}
