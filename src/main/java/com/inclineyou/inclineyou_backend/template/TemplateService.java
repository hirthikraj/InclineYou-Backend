package com.inclineyou.inclineyou_backend.template;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
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
            List<SetDetail> setDetail
    ) {}

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
            List<SetDetail> setDetail
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
            int activeAssignedCount
    ) {}

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
            boolean behindTemplate
    ) {}

    // ── List ──────────────────────────────────────────────────────────────────

    public List<TemplateResponse> list(UUID trainerId) {
        var rows = jdbc.queryForList("""
                SELECT t.id::text, t.name, t.goal, t.description, t.structure::text AS structure,
                       t.day_labels::text AS day_labels, t.weeks, t.training_days,
                       t.created_at, t.updated_at,
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
        return rows.stream().map(this::toResponse).toList();
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
        p.put("structure",    toJsonString(req.exercises()));
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
        return toResponse(findOwned(id, trainerId));
    }

    // ── Update ────────────────────────────────────────────────────────────────

    @Transactional
    public TemplateResponse update(UUID id, UUID trainerId, UpdateTemplateRequest req) {
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
        if (req.exercises() != null)   { p.put("structure", toJsonString(req.exercises()));
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
        findOwned(id, trainerId);
        jdbc.update("""
                UPDATE template SET deleted_at = NOW(), updated_at = NOW()
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("id", id.toString(), "tid", trainerId.toString()));
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

        var rows = jdbc.queryForList("""
                SELECT p.id::text AS program_id, p.client_id::text, c.name AS client_name,
                       p.name AS program_name, p.start_date::text, p.end_date::text, p.status,
                       p.created_at, p.updated_at
                FROM program p
                JOIN client c ON c.id = p.client_id
                WHERE p.template_id = :tmpl::uuid AND p.trainer_id = :tid::uuid AND p.deleted_at IS NULL
                ORDER BY (p.status = 'active') DESC, p.created_at DESC
                """, Map.of("tmpl", templateId.toString(), "tid", trainerId.toString()));

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
                toEpochMilli(r.get("updated_at")) < templateUpdated
        )).toList();
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

        Map<Integer, ScheduleEntry> bySlot = validateSchedule(req.schedule(), slots);

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
        p.put("schedule",  req.schedule() == null || req.schedule().isEmpty()
                ? null : toJsonString(req.schedule()));
        p.put("now",       Timestamp.from(now));

        jdbc.update("""
                INSERT INTO program (id, trainer_id, client_id, template_id, name, goal,
                    start_date, end_date, schedule, status, created_at, updated_at)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, :tmplId::uuid, :name, :goal,
                    :startDate, :endDate, CAST(:schedule AS jsonb), 'active', :now, :now)
                """, p);

        copyBlueprintInto(programId, blueprint, bySlot, now);

        return new ProgramSummary(
                programId.toString(), req.clientId(), templateId.toString(),
                programName, goal,
                startDate != null ? startDate.toString() : null,
                endDate   != null ? endDate.toString()   : null,
                "active", now.toEpochMilli(), now.toEpochMilli());
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
            ep.put("now",             Timestamp.from(now));

            jdbc.update("""
                    INSERT INTO program_exercise (id, program_id, exercise_id, sets, reps,
                        rest_seconds, duration_seconds, target_load, notes, day_of_week, week,
                        order_index, tempo, alt_exercise_id, group_id, set_detail, created_at, updated_at)
                    VALUES (:id::uuid, :programId::uuid, :exerciseId::uuid, :sets, :reps,
                        :restSeconds, :durationSeconds, :targetLoad, :notes, :dayOfWeek, :week,
                        :orderIndex, :tempo, :altExerciseId::uuid, :groupId::uuid,
                        CAST(:setDetail AS jsonb), :now, :now)
                    """, ep);
        }
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
                       t.created_at, t.updated_at,
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

    /** "1,2,3" → {1,2,3}. Junk and out-of-range values are dropped, not thrown. */
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
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "This program trains %d day%s a week — schedule exactly %d weekday%s for it (got %d)."
                            .formatted(slots.size(), slots.size() == 1 ? "" : "s",
                                       slots.size(), slots.size() == 1 ? "" : "s", given));
        }
        if (slots.isEmpty()) return Map.of();

        var bySlot = new HashMap<Integer, ScheduleEntry>();
        var weekdays = new HashSet<Integer>();
        for (ScheduleEntry entry : schedule) {
            if (!slots.contains(entry.day()) || bySlot.put(entry.day(), entry) != null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "The schedule must cover each of this program's days exactly once.");
            }
            if (entry.weekday() < 1 || entry.weekday() > 7 || !weekdays.add(entry.weekday())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Each day needs its own weekday, Monday (1) through Sunday (7).");
            }
            if (entry.time() == null || !HHMM.matcher(entry.time()).matches()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Each day needs a time, as 24-hour HH:mm.");
            }
        }
        return bySlot;
    }

    private TemplateResponse toResponse(Map<String, Object> r) {
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
                intOf(r.get("active_assigned_count")));
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
                    setDetail(e)));
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

    private Map<String, String> parseDayLabels(String json) {
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
