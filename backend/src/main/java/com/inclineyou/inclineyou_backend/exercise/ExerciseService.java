package com.inclineyou.inclineyou_backend.exercise;

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
    /** Static, not injected — see WorkingHoursService on why a mapper bean is not assumed. */
    private static final com.fasterxml.jackson.databind.ObjectMapper JSON =
            new com.fasterxml.jackson.databind.ObjectMapper();

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
            String logType,
            /*
             * ── APPENDED BY V9 ───────────────────────────────────────────────
             * 'published' | 'draft'. Drafts exist only on custom rows.
             */
            String status,
            /** Muscles worked besides {@code target}. Never null — [] until authored. */
            List<String> secondaryTargets,
            /**
             * Short coaching cues. Never null — [] until authored, and
             * deliberately unseeded: see V9 on why a generated cue must not be
             * served as a real one.
             */
            List<String> formCues
    ) {}

    public record SearchResult(List<ExerciseResponse> exercises, int total) {}

    /** One card on the library's *By categories* view. */
    public record Category(String muscleGroup, int count) {}

    /**
     * The *By categories* view — V9. {@code total} is every non-draft row the
     * caller can see; {@code uncategorised} is the part of it with no muscle
     * group, which gets no card of its own.
     */
    public record CategoriesResponse(List<Category> categories, int total, int uncategorised) {}

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
            String logType,
            /* ---- V9 ---- */
            /** The primary muscle. Optional; the library's filter reads it. */
            String target,
            /**
             * Only the literal 'draft' makes a draft; anything else — null, a
             * typo — is published, because a movement silently filed as a draft
             * is one that vanishes from the library its author is looking at.
             */
            String status
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

    public SearchResult search(UUID trainerId, String ids, String q, String source, String muscleGroup,
                               String bodyPart, String target, String equipment, String level,
                               int page, int size) {
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

        /*
         * ?source= — V9. Not applied to an `ids` read: a caller that named its
         * rows is resolving names for a log or a plan, and a draft that is
         * already in one must still come back with its name.
         */
        if (!byIds) conditions.add(sourcePredicate(source));

        /*
         * `q` matches the four columns a trainer actually searches by — "quads"
         * and "hinge" find movements whose names say neither. Not `description`:
         * prose matches everything and ranks nothing.
         */
        if (q != null && !q.isBlank()) {
            params.put("q", q.strip());
            conditions.add("(name ILIKE '%' || :q || '%' OR target ILIKE '%' || :q || '%'"
                    + " OR movement_pattern ILIKE '%' || :q || '%' OR body_part ILIKE '%' || :q || '%')");
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

    /**
     * The library a trainer is browsing, by where a row came from.
     *
     * <ul>
     *   <li>{@code incline} — the catalogue ({@code is_custom = false});</li>
     *   <li>{@code mine} — their own finished movements;</li>
     *   <li>{@code draft} — their own unfinished ones (drafts exist only on
     *       custom rows, so this cannot surface anybody else's);</li>
     *   <li>anything else, including absent — everything but drafts. An unknown
     *       value falls through to the default rather than answering an empty
     *       library, which would read as "you have no exercises".</li>
     * </ul>
     * Always inside the caller-visibility predicate above, so {@code mine} and
     * {@code draft} can never reach another trainer's rows.
     */
    private static String sourcePredicate(String source) {
        String s = source == null ? "" : source.strip().toLowerCase();
        return switch (s) {
            case "incline" -> "is_custom = false AND status <> 'draft'";
            case "mine"    -> "is_custom = true AND status <> 'draft'";
            case "draft"   -> "is_custom = true AND status = 'draft'";
            default        -> "status <> 'draft'";
        };
    }

    /** The one row of columns every read of this table selects. */
    private static final String EXERCISE_COLUMNS =
            "id::text, name, muscle_group, body_part, target, equipment, movement_pattern, " +
            "description, image_url, video_url, level, is_custom, created_at, log_type, " +
            "status, secondary_targets::text, form_cues::text";

    // ── One exercise ──────────────────────────────────────────────────────────

    /**
     * One row, whole — V9, for the exercise info panel. Visible means what the
     * list means (the catalogue, or the caller's own custom rows, drafts
     * included); anything else is a 404, not a 403, so the route cannot confirm
     * that somebody else's private movement exists.
     */
    public ExerciseResponse get(UUID trainerId, UUID id) {
        var rows = jdbc.queryForList(
                "SELECT " + EXERCISE_COLUMNS + " FROM exercise" +
                " WHERE id = :id::uuid AND deleted_at IS NULL" +
                " AND (is_custom = false OR trainer_id = :tid::uuid)",
                Map.of("id", id.toString(), "tid", trainerId.toString()));
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Exercise not found");
        return toResponse(rows.get(0));
    }

    // ── Categories ────────────────────────────────────────────────────────────

    /**
     * The *By categories* view — V9.
     *
     * <p>Counts the CALLER's library: the catalogue plus their own custom rows,
     * drafts excluded, which is exactly what the default list read shows — so a
     * card saying 34 opens a list of 34.
     *
     * <p>Ordered by the catalogue's muscle-group list ({@code /v1/exercises/meta}'s
     * order), <b>never by count</b>: a grid that reshuffles every time a trainer
     * adds a movement is one nobody can find their way around by position. A
     * group only a custom row uses comes after the catalogue's, alphabetically.
     * Empty groups get no card, and rows with no group are counted in
     * {@code uncategorised} rather than drawn as a card called "null".
     */
    public CategoriesResponse categories(UUID trainerId) {
        var rows = jdbc.queryForList("""
                SELECT muscle_group, count(*) AS n,
                       bool_or(NOT is_custom) AS in_catalogue
                FROM exercise
                WHERE deleted_at IS NULL AND status <> 'draft'
                  AND (is_custom = false OR trainer_id = :tid::uuid)
                GROUP BY muscle_group
                """, Map.of("tid", trainerId.toString()));

        var catalogueOrder = meta().muscleGroups();
        int total = 0;
        int uncategorised = 0;
        var cards = new ArrayList<Category>();
        for (var r : rows) {
            int n = ((Number) r.get("n")).intValue();
            total += n;
            String group = str(r.get("muscle_group"));
            if (group == null || group.isBlank()) uncategorised += n;
            else if (n > 0) cards.add(new Category(group, n));
        }
        cards.sort(Comparator
                .comparingInt((Category c) -> {
                    int i = catalogueOrder.indexOf(c.muscleGroup());
                    return i < 0 ? Integer.MAX_VALUE : i;
                })
                .thenComparing(Category::muscleGroup, String.CASE_INSENSITIVE_ORDER));
        return new CategoriesResponse(cards, total, uncategorised);
    }

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
                str(r.get("log_type")),
                r.get("status") == null ? "published" : str(r.get("status")),
                stringList(r.get("secondary_targets")),
                stringList(r.get("form_cues")));
    }

    /**
     * A JSONB list of strings, or [] — never null, because the web types both
     * lists as present arrays. A value that is not a list of strings (a
     * hand-edited row) also reads as [] rather than failing the whole page.
     */
    private List<String> stringList(Object raw) {
        if (raw == null) return List.of();
        try {
            var parsed = JSON.readValue(raw.toString(), Object.class);
            if (!(parsed instanceof List<?> list)) return List.of();
            var out = new ArrayList<String>();
            for (Object o : list) if (o instanceof String s && !s.isBlank()) out.add(s);
            return out;
        } catch (Exception e) {
            return List.of();
        }
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
        params.put("target",          target(req.target()));
        params.put("status",          "draft".equals(req.status()) ? "draft" : "published");
        params.put("now",             Timestamp.from(now));

        jdbc.update("""
                INSERT INTO exercise (id, name, muscle_group, equipment, movement_pattern,
                    description, image_url, video_url, log_type, target, status,
                    is_custom, trainer_id, created_at, updated_at)
                VALUES (:id::uuid, :name, :muscleGroup, :equipment, :movementPattern,
                    :description, :imageUrl, :videoUrl, :logType, :target, :status,
                    true, :tid::uuid, :now, :now)
                """, params);

        // bodyPart stays null: it is the seeded library's ten-way taxonomy, and
        // asking a trainer inventing "Ananya's shoulder rehab" to place it there
        // is a form to fill in for the library's benefit, not theirs. `target` is
        // different since V9 — the redesigned form asks for it as the primary
        // muscle, and it is what the library's filter reads. A custom movement
        // gets no generated cues or secondary targets: [] until somebody writes
        // them.
        return new ExerciseResponse(
                id.toString(), req.name(), req.muscleGroup(), null, target(req.target()), req.equipment(),
                req.movementPattern(), req.description(), req.imageUrl(), req.videoUrl(),
                null, true, now.toEpochMilli(), logType(req.logType()),
                (String) params.get("status"), List.of(), List.of()
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

    /** Trimmed, blank as null, cut at the column's 50 like the other short fields. */
    private static String target(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String value = raw.strip();
        return value.length() > 50 ? value.substring(0, 50) : value;
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
