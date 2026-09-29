package com.inclineyou.inclineyou_backend.core.template;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.inclineyou.inclineyou_backend.core.program.ProgramRuleException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * V11 · the certified shelf — programs InclineYou authors, which a trainer
 * browses, previews and COPIES. Nothing here writes a certified row: the table
 * is SELECT-only for the request role, and the one number that moves,
 * {@code used_count}, moves through {@code certified_template_used()}.
 *
 * <h2>The blueprint is resolved on every read</h2>
 *
 * A certified blueprint names each movement by the catalogue's stable
 * {@code exercise_source_id} ({@code gymvisual-0025}), because the catalogue's
 * UUIDs are minted per database by the seeder, after Flyway has run — see V11.
 * So every read and the copy resolve source ids to this database's
 * {@code exercise.id} in one query, and the resolved blob is what the rest of
 * the template machinery ({@link TemplateService#parseStructure}) reads. An entry
 * whose movement is not in the library is dropped, never drawn blank.
 *
 * <h2>What it answers in the template shape</h2>
 *
 * Each item is a {@code TemplateWire} — so the shelf, the preview and the builder
 * can share one renderer — with the counts a trainer's template has pinned to
 * zero (nobody is ever assigned the original) and two blocks of its own:
 * {@code certified} (what the catalogue says about it) and {@code mine} (the
 * caller's own copy, if they have made one, and whether the original has moved
 * since).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class CertifiedService {

    /** The blueprint's storage casing — the same mapper `TemplateService` uses. */
    private static final ObjectMapper STORE = new ObjectMapper()
            .setPropertyNamingStrategy(com.fasterxml.jackson.databind.PropertyNamingStrategies.SNAKE_CASE);

    private final NamedParameterJdbcTemplate jdbc;
    private final TemplateService templates;

    /** What the catalogue says about a certified program. */
    public record CertifiedInfo(
            String summary,
            /** beginner | intermediate | advanced */
            String level,
            /** full-gym | dumbbells | bodyweight */
            String equipment,
            /** When a qualified human reviewed it — NOT updated_at. Null = never reviewed. */
            Long reviewedAt,
            int usedCount,
            /** True for a placeholder written to exercise the shelf, not a program to coach from. */
            boolean sample
    ) {}

    /** The caller's own copy of it. {@code stale}: the original was revised after the copy was taken. */
    public record Mine(String id, long copiedAt, boolean stale) {}

    public record CertifiedResponse(
            String id,
            String name,
            String goal,
            String description,
            /** Empty on the list, the full blueprint on the preview. */
            List<TemplateService.TemplateExerciseResponse> exercises,
            Map<String, String> dayLabels,
            long createdAt,
            long updatedAt,
            Integer weeks,
            List<Integer> trainingDays,
            /* A TemplateWire's counts, pinned: nobody is ever on the original. */
            int assignedCount,
            int activeAssignedCount,
            List<TemplateService.AssignedClient> assignedClients,
            String source,
            TemplateService.CopiedFrom copiedFrom,
            /* Certified-only. */
            int exerciseCount,
            CertifiedInfo certified,
            Mine mine
    ) {}

    public record CopyRequest(String name) {}

    private static final String COLUMNS = """
            id::text, name, goal, description, summary, level, equipment,
            structure::text AS structure, day_labels::text AS day_labels, weeks, training_days,
            reviewed_at, is_sample, used_count, created_at, updated_at
            """;

    // ── Reads ─────────────────────────────────────────────────────────────────

    /**
     * The shelf. Never emptied for a new account, never filtered by what the
     * caller has copied — `mine` marks those instead. Ordered by level, then
     * name, then id, so it is a total order.
     */
    public List<CertifiedResponse> list(UUID trainerId) {
        var rows = jdbc.queryForList("""
                SELECT %s FROM certified_template WHERE deleted_at IS NULL
                ORDER BY CASE level WHEN 'beginner' THEN 1 WHEN 'intermediate' THEN 2
                                    WHEN 'advanced' THEN 3 ELSE 4 END, name, id
                """.formatted(COLUMNS), Map.of());
        var mine = minesFor(trainerId);
        var resolved = resolveAll(rows);
        var out = new ArrayList<CertifiedResponse>(rows.size());
        for (int i = 0; i < rows.size(); i++) {
            out.add(toResponse(rows.get(i), resolved.get(i), false, mine.get(str(rows.get(i).get("id")))));
        }
        return out;
    }

    /** The preview: the same item, WITH the blueprint. 404 when unknown or retired. */
    public CertifiedResponse get(UUID trainerId, UUID id) {
        var row = load(id);
        return toResponse(row, resolveAll(List.of(row)).getFirst(), true,
                minesFor(trainerId).get(id.toString()));
    }

    // ── Copy ──────────────────────────────────────────────────────────────────

    /**
     * USING ONE COPIES IT. One transaction: a trainer-owned template with the
     * blueprint copied VERBATIM (groupId, setDetail, the named workouts, day
     * labels, training days, weeks — everything, resolved to this database's
     * exercise ids), provenance frozen as at this moment, and the original's
     * {@code used_count} bumped. The name is kept as-is by default — no
     * "(copy)" suffix, because on the trainer's shelf it is simply theirs.
     *
     * <p>Copying twice makes two copies; `mine` reports the newest.
     */
    @Transactional
    public TemplateService.TemplateResponse copy(UUID trainerId, UUID id, CopyRequest req) {
        var row = load(id);
        String structure = resolveAll(List.of(row)).getFirst();
        String name = req != null && req.name() != null && !req.name().isBlank()
                ? req.name().strip() : str(row.get("name"));
        if (name.length() > 150) name = name.substring(0, 150);

        var copy = templates.insertCopy(trainerId, name, str(row.get("goal")), str(row.get("description")),
                structure, str(row.get("day_labels")), row.get("weeks"), row.get("training_days"),
                new TemplateService.CopiedFrom(id.toString(), str(row.get("name")),
                        epochMilli(row.get("updated_at"))));
        jdbc.queryForList("SELECT certified_template_used(:id::uuid)", Map.of("id", id.toString()));
        return copy;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Map<String, Object> load(UUID id) {
        var rows = jdbc.queryForList("""
                SELECT %s FROM certified_template WHERE id = :id::uuid AND deleted_at IS NULL
                """.formatted(COLUMNS), Map.of("id", id.toString()));
        if (rows.isEmpty()) throw ProgramRuleException.certifiedNotFound();
        return rows.getFirst();
    }

    /**
     * The caller's newest live copy of each certified program, keyed by the
     * original's id. {@code stale} compares the frozen provenance with the
     * original's current {@code updated_at}.
     */
    private Map<String, Mine> minesFor(UUID trainerId) {
        var rows = jdbc.queryForList("""
                SELECT DISTINCT ON (t.copied_from_id)
                       t.copied_from_id::text AS original, t.id::text AS id, t.created_at,
                       -- At millisecond precision: the frozen value travels the
                       -- wire as epoch ms, Postgres keeps microseconds, and an
                       -- exact compare made every copy stale by a few µs.
                       (t.copied_from_updated_at IS NOT NULL
                        AND date_trunc('milliseconds', t.copied_from_updated_at)
                            < date_trunc('milliseconds', c.updated_at)) AS stale
                FROM template t
                JOIN certified_template c ON c.id = t.copied_from_id
                WHERE t.trainer_id = :tid::uuid AND t.deleted_at IS NULL AND t.copied_from_id IS NOT NULL
                ORDER BY t.copied_from_id, t.created_at DESC, t.id
                """, Map.of("tid", trainerId.toString()));
        var out = new HashMap<String, Mine>();
        for (var r : rows) {
            out.put(str(r.get("original")),
                    new Mine(str(r.get("id")), epochMilli(r.get("created_at")), Boolean.TRUE.equals(r.get("stale"))));
        }
        return out;
    }

    /**
     * Every row's blueprint with {@code exercise_source_id} resolved to
     * {@code exercise_id}, as a JSON array in storage casing. One library query
     * for all of them. Entries that resolve to nothing are dropped.
     */
    private List<String> resolveAll(List<Map<String, Object>> rows) {
        var parsed = new ArrayList<List<Map<String, Object>>>(rows.size());
        var sourceIds = new TreeSet<String>();
        for (var r : rows) {
            List<Map<String, Object>> entries;
            try {
                entries = STORE.readValue(Objects.requireNonNullElse(str(r.get("structure")), "[]"),
                        new TypeReference<>() {});
            } catch (Exception e) {
                log.warn("Unreadable certified blueprint {}: {}", r.get("id"), e.getMessage());
                entries = List.of();
            }
            parsed.add(entries);
            for (var e : entries) {
                if (e != null && e.get("exercise_source_id") instanceof String s) sourceIds.add(s);
            }
        }
        var ids = new HashMap<String, String>();
        if (!sourceIds.isEmpty()) {
            jdbc.queryForList("""
                    SELECT source_id, id::text AS id FROM exercise
                    WHERE source_id IN (:ids) AND deleted_at IS NULL AND is_custom = false
                    """, Map.of("ids", sourceIds))
                .forEach(x -> ids.put(str(x.get("source_id")), str(x.get("id"))));
        }
        var out = new ArrayList<String>(rows.size());
        for (var entries : parsed) {
            var resolved = new ArrayList<Map<String, Object>>();
            for (var e : entries) {
                if (e == null) continue;
                String exerciseId = e.get("exercise_id") instanceof String s && !s.isBlank()
                        ? s : ids.get(String.valueOf(e.get("exercise_source_id")));
                if (exerciseId == null) continue;
                var copy = new LinkedHashMap<>(e);
                copy.put("exercise_id", exerciseId);
                resolved.add(copy);
            }
            try {
                out.add(STORE.writeValueAsString(resolved));
            } catch (Exception ex) {
                out.add("[]");
            }
        }
        return out;
    }

    private CertifiedResponse toResponse(Map<String, Object> r, String structure, boolean withExercises, Mine mine) {
        var entries = templates.parseStructure(structure);
        var days = new TreeSet<>(templates.parseDayCsv(str(r.get("training_days"))));
        for (var ex : entries) {
            if (ex.dayOfWeek() != null && ex.dayOfWeek() >= 1 && ex.dayOfWeek() <= 7) days.add(ex.dayOfWeek());
        }
        return new CertifiedResponse(
                str(r.get("id")),
                str(r.get("name")),
                str(r.get("goal")),
                str(r.get("description")),
                withExercises ? entries : List.of(),
                templates.parseDayLabels(str(r.get("day_labels"))),
                epochMilli(r.get("created_at")),
                epochMilli(r.get("updated_at")),
                r.get("weeks") instanceof Number n ? n.intValue() : null,
                List.copyOf(days),
                0, 0, List.of(),
                "certified",
                null,
                entries.size(),
                new CertifiedInfo(
                        str(r.get("summary")),
                        str(r.get("level")),
                        str(r.get("equipment")),
                        r.get("reviewed_at") == null ? null : epochMilli(r.get("reviewed_at")),
                        r.get("used_count") instanceof Number n ? n.intValue() : 0,
                        Boolean.TRUE.equals(r.get("is_sample"))),
                mine);
    }

    private static String str(Object v) { return v == null ? null : v.toString(); }

    private static long epochMilli(Object v) {
        if (v instanceof java.sql.Timestamp ts)        return ts.toInstant().toEpochMilli();
        if (v instanceof java.time.OffsetDateTime odt) return odt.toInstant().toEpochMilli();
        if (v instanceof java.time.Instant i)          return i.toEpochMilli();
        return 0L;
    }
}
