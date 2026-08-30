package com.xrep.xrep_backend.exercise;

import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import java.util.ArrayList;

@Service
@RequiredArgsConstructor
public class ExerciseService {

    private final NamedParameterJdbcTemplate jdbc;

    // ── DTOs ──────────────────────────────────────────────────────────────────

    public record ExerciseResponse(
            String id,
            String name,
            String muscleGroup,
            /** "chest", "upper legs" — the ten-way split the library groups by. Null on custom. */
            String bodyPart,
            /** "pectorals", "quads" — the primary muscle. Mirrors muscleGroup on seeded rows. */
            String target,
            String equipment,
            String movementPattern,
            String description,
            /** 180×180 JPG thumbnail. © Gym visual — https://gymvisual.com/ */
            String imageUrl,
            /** 180×180 animation GIF, the demo loop. Same attribution as imageUrl. */
            String videoUrl,
            String level,
            boolean isCustom,
            long createdAt,
            /*
             * V12's `log_type` — 'weight_reps' | 'reps'. NULL on every seeded row
             * and read as 'weight_reps', which is what all of them are.
             *
             * It decides whether the log grid draws a load field or the words
             * "no load", and whether the record test runs its reps branch — where
             * there is no plate step, so every real record is a loud one. The
             * column has existed since V12 and travels in the sync envelope, so
             * the phone reads it out of SQLite; this DTO never carried it, which
             * left the web INFERRING the answer from whether past sets had a load.
             * That inference is a good guess and it is still a guess, and it has
             * nothing at all to go on for an exercise nobody has logged yet.
             *
             * APPENDED LAST — the additive-only contract, not tidiness.
             */
            String logType
    ) {}

    public record SearchResult(List<ExerciseResponse> exercises, int total) {}

    /**
     * The filter vocabularies, read off the library rather than hard-coded.
     *
     * <p>{@code levels} comes back empty since V21: the current dataset does not
     * grade exercises beginner/expert. The list and the {@code level} filter stay
     * on the API — an empty vocabulary renders as no filter, whereas a removed
     * field breaks whichever client asks for it next.
     */
    public record MetaResponse(
            List<String> muscleGroups,
            List<String> bodyParts,
            List<String> targets,
            List<String> equipment,
            List<String> levels
    ) {}

    public record CreateExerciseRequest(
            @NotBlank String name,
            String muscleGroup,
            String equipment,
            String movementPattern,
            String description,
            String imageUrl,
            String videoUrl,
            /*
             * 'weight_reps' | 'reps'; null defaults to 'weight_reps', the same
             * default the sync push applies (SyncService, custom exercise insert).
             *
             * Set once at creation and never updated, because V12 says so: every
             * set already recorded against an exercise stops making sense if this
             * changes. Without it on this request a custom exercise created over
             * REST could only ever be a weight exercise, so the web had no way to
             * add a chin-up — which the phone has been able to do since V12.
             */
            String logType
    ) {}

    // ── Search ────────────────────────────────────────────────────────────────

    /**
     * The most exercises {@code ?ids=} will resolve in one call.
     *
     * <p>A ceiling rather than a silent truncation: a caller that asks for 800
     * names and gets 600 has no way to tell which 200 are missing, and would draw
     * a set log with a blank where the exercise should be. Over the limit is a
     * {@code 400} saying so. Six hundred is already far past the real caller —
     * the largest genuine ask is a session's movements plus a client's history,
     * which is tens.
     */
    private static final int MAX_IDS = 600;

    public SearchResult search(UUID trainerId, String ids, String q, String muscleGroup, String bodyPart,
                               String target, String equipment, String level, int page, int size) {
        size = Math.min(size, 100);

        var params = new HashMap<String, Object>();
        params.put("tid",    trainerId.toString());
        params.put("limit",  size);
        params.put("offset", (long) page * size);

        // Build WHERE dynamically — avoids null-param type inference issues with ILIKE
        var conditions = new ArrayList<String>();
        conditions.add("deleted_at IS NULL");
        conditions.add("(is_custom = false OR trainer_id = :tid::uuid)");

        /*
         * ?ids=a,b,c — resolve a known handful of UUIDs to their rows.
         *
         * The phone holds the library in SQLite and joins locally; this half
         * holds nothing, so every screen that draws a set log, a program row or
         * a plan had to pull the whole library (`?size=2000`) to turn six UUIDs
         * into six names. One request, but the largest response the API serves,
         * asked for on load, on every one of those screens.
         *
         * Two things this must not do, both of which would be worse than the
         * problem it solves:
         *
         *   · A malformed id must never silently drop out of the filter. Ids
         *     are parsed strictly and an unparseable one is a 400 — the
         *     alternative returns a shorter list that looks complete.
         *   · An `ids` param that resolves to nothing must return NOTHING. If an
         *     empty id set fell through to "no filter" the caller would get the
         *     entire library back for an empty basket, which is the exact
         *     response this parameter exists to stop.
         *
         * Paging is ignored when it is present — the caller named the rows it
         * wants, so a `size=20` default silently keeping the first twenty of
         * thirty named ids is the same missing-name bug in another costume.
         */
        boolean byIds = ids != null && !ids.isBlank();
        if (byIds) {
            var parsed = parseIds(ids);
            if (parsed.isEmpty()) return new SearchResult(List.of(), 0);
            params.put("ids", parsed);
            conditions.add("id IN (:ids)");
        }

        if (q != null && !q.isBlank()) {
            params.put("q", q.strip());
            conditions.add("name ILIKE '%' || :q || '%'");
        }
        if (muscleGroup != null && !muscleGroup.isBlank()) {
            params.put("muscleGroup", muscleGroup);
            conditions.add("muscle_group = :muscleGroup");
        }
        if (bodyPart != null && !bodyPart.isBlank()) {
            params.put("bodyPart", bodyPart);
            conditions.add("body_part = :bodyPart");
        }
        if (target != null && !target.isBlank()) {
            params.put("target", target);
            conditions.add("target = :target");
        }
        if (equipment != null && !equipment.isBlank()) {
            params.put("equipment", equipment);
            conditions.add("equipment = :equipment");
        }
        if (level != null && !level.isBlank()) {
            params.put("level", level);
            conditions.add("level = :level");
        }

        String where = "WHERE " + String.join(" AND ", conditions);

        var rows = jdbc.queryForList(
                "SELECT " + EXERCISE_COLUMNS +
                " FROM exercise " + where +
                " ORDER BY is_custom ASC, name ASC" +
                (byIds ? "" : " LIMIT :limit OFFSET :offset"),
                params);

        var exercises = rows.stream().map(this::toResponse).toList();

        // With `ids` the answer is what came back — counting the same predicate a
        // second time would only ever restate `exercises.size()`, and one of the
        // two would be a lie the moment a row was deleted between the queries.
        if (byIds) return new SearchResult(exercises, exercises.size());

        Integer total = jdbc.queryForObject(
                "SELECT COUNT(*) FROM exercise " + where, params, Integer.class);

        return new SearchResult(exercises, total == null ? 0 : total);
    }

    /** The one row of columns every read of this table selects. */
    private static final String EXERCISE_COLUMNS =
            "id::text, name, muscle_group, body_part, target, equipment, movement_pattern, " +
            "description, image_url, video_url, level, is_custom, created_at, log_type";

    private ExerciseResponse toResponse(Map<String, Object> r) {
        return new ExerciseResponse(
                str(r.get("id")),
                str(r.get("name")),
                str(r.get("muscle_group")),
                str(r.get("body_part")),
                str(r.get("target")),
                str(r.get("equipment")),
                str(r.get("movement_pattern")),
                str(r.get("description")),
                str(r.get("image_url")),
                str(r.get("video_url")),
                str(r.get("level")),
                Boolean.TRUE.equals(r.get("is_custom")),
                toEpochMilli(r.get("created_at")),
                str(r.get("log_type")));
    }

    /**
     * Splits `a,b,c` into UUIDs. Blank segments are tolerated — a trailing comma
     * from a join is a formatting slip, not a missing row — but a segment with
     * characters in it that is not a UUID is a 400. See the note in search().
     */
    private List<UUID> parseIds(String raw) {
        var out = new ArrayList<UUID>();
        for (String part : raw.split(",")) {
            String token = part.strip();
            if (token.isEmpty()) continue;
            try {
                out.add(UUID.fromString(token));
            } catch (IllegalArgumentException e) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Not an exercise id: " + token);
            }
        }
        if (out.size() > MAX_IDS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Too many ids: " + out.size() + " (max " + MAX_IDS + ")");
        }
        return out;
    }

    // ── Meta ──────────────────────────────────────────────────────────────────

    public MetaResponse meta() {
        var groups = stringColumn("""
                SELECT DISTINCT muscle_group AS val FROM exercise
                WHERE is_custom = false AND deleted_at IS NULL AND muscle_group IS NOT NULL
                ORDER BY val
                """);

        var parts = stringColumn("""
                SELECT DISTINCT body_part AS val FROM exercise
                WHERE is_custom = false AND deleted_at IS NULL AND body_part IS NOT NULL
                ORDER BY val
                """);

        var targets = stringColumn("""
                SELECT DISTINCT target AS val FROM exercise
                WHERE is_custom = false AND deleted_at IS NULL AND target IS NOT NULL
                ORDER BY val
                """);

        var equips = stringColumn("""
                SELECT DISTINCT equipment AS val FROM exercise
                WHERE is_custom = false AND deleted_at IS NULL AND equipment IS NOT NULL
                ORDER BY val
                """);

        // Empty since V21 — see MetaResponse. Kept so the shape does not change.
        var levels = stringColumn("""
                SELECT DISTINCT level AS val FROM exercise
                WHERE is_custom = false AND deleted_at IS NULL AND level IS NOT NULL
                ORDER BY val
                """);

        return new MetaResponse(groups, parts, targets, equips, levels);
    }

    // ── Custom exercise create ─────────────────────────────────────────────────

    @Transactional
    public ExerciseResponse createCustom(UUID trainerId, CreateExerciseRequest req) {
        UUID id = UUID.randomUUID();
        Instant now = Instant.now();

        var params = new HashMap<String, Object>();
        params.put("id",              id.toString());
        params.put("tid",             trainerId.toString());
        params.put("name",            req.name());
        params.put("muscleGroup",     req.muscleGroup());
        params.put("equipment",       req.equipment());
        params.put("movementPattern", req.movementPattern());
        params.put("description",     req.description());
        params.put("imageUrl",        req.imageUrl());
        params.put("videoUrl",        req.videoUrl());
        params.put("logType",         logType(req.logType()));
        params.put("now",             Timestamp.from(now));

        jdbc.update("""
                INSERT INTO exercise (id, name, muscle_group, equipment, movement_pattern,
                    description, image_url, video_url, log_type, is_custom, trainer_id, created_at, updated_at)
                VALUES (:id::uuid, :name, :muscleGroup, :equipment, :movementPattern,
                    :description, :imageUrl, :videoUrl, :logType, true, :tid::uuid, :now, :now)
                """, params);

        // bodyPart and target stay null: they are the seeded library's taxonomy, and
        // asking a trainer inventing "Ananya's shoulder rehab" to place it in a
        // ten-way body-part split is a form to fill in for the library's benefit,
        // not theirs. The app groups custom exercises under "Yours" regardless.
        return new ExerciseResponse(
                id.toString(), req.name(), req.muscleGroup(), null, null, req.equipment(),
                req.movementPattern(), req.description(), req.imageUrl(), req.videoUrl(),
                null, true, now.toEpochMilli(), logType(req.logType())
        );
    }

    /**
     * 'weight_reps' | 'reps'. Anything else — including null — becomes
     * 'weight_reps', matching the sync push's `strOrDefault` on the same column
     * rather than 400ing. Two writers of one column that disagree about an
     * unrecognised value would give the same custom exercise two log types
     * depending on which half created it.
     */
    private static String logType(String raw) {
        if (raw == null) return "weight_reps";
        String value = raw.trim().toLowerCase();
        return value.equals("reps") ? "reps" : "weight_reps";
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private List<String> stringColumn(String sql) {
        return jdbc.queryForList(sql, Map.of())
                .stream().map(r -> str(r.get("val"))).toList();
    }

    private String str(Object v) {
        return v == null ? null : v.toString();
    }

    private long toEpochMilli(Object v) {
        if (v instanceof java.sql.Timestamp ts)           return ts.toInstant().toEpochMilli();
        if (v instanceof java.time.OffsetDateTime odt)    return odt.toInstant().toEpochMilli();
        if (v instanceof java.time.LocalDateTime ldt)     return ldt.toInstant(java.time.ZoneOffset.UTC).toEpochMilli();
        if (v instanceof java.time.Instant i)             return i.toEpochMilli();
        return 0L;
    }
}
