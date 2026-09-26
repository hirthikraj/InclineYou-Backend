package com.inclineyou.inclineyou_backend.assessment;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

/**
 * V14 · the trainer's assessment templates — which catalogue measurements to
 * take and which questions to ask.
 *
 * <h2>Normalised on write</h2>
 *
 * The editor holds the whole draft in the browser and saves it as a unit, so
 * each block arrives as {@code {on, keys|items}} — or, from a caller that does
 * not know about the switch yet, as a bare list, which counts as ON (defaulting
 * it off would silently drop what was just sent). Then:
 * <ul>
 *   <li>measurement keys are filtered to the catalogue and de-duplicated in the
 *       order the trainer built them;</li>
 *   <li>a question of an unknown {@code kind} becomes {@code text}; {@code scale}
 *       is kept only on a {@code rating}, and must be 5, 10 or 20, else 10;</li>
 *   <li>{@code options}, {@code allowMultiple} and {@code allowCustom} are
 *       FORCED empty / false unless {@code kind == choice} — the editor keeps them
 *       while a trainer flips a question's kind back and forth, and what is
 *       stored has to be what the client will be shown;</li>
 *   <li>missing question and option ids are minted.</li>
 * </ul>
 *
 * {@code PUT} replaces each block that is PRESENT, whole. There is no
 * per-question PATCH, for the workout builder's reason.
 */
@Service
@RequiredArgsConstructor
public class AssessmentTemplateService {

    /** Tolerant: the portal (module 11) writes readings and answers, and a key this build lacks must not fail a read. */
    static final ObjectMapper JSON = new ObjectMapper()
            .configure(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    private static final int MAX_NAME = 120;
    private static final int MAX_DESCRIPTION = 2000;
    private static final int MAX_QUESTIONS = 50;
    private static final int MAX_OPTIONS = 20;
    private static final int MAX_TEXT = 500;
    private static final Set<String> KINDS = Set.of("yesno", "rating", "text", "choice");
    private static final Set<Integer> SCALES = Set.of(5, 10, 20);

    private final NamedParameterJdbcTemplate jdbc;

    public record MeasurementBlock(boolean on, List<String> keys) {}

    public record QuestionBlock(boolean on, List<AssessmentCatalogue.Question> items) {}

    /** Timestamps are ISO strings on this wire — the one exception to epoch ms (V14). */
    public record TemplateResponse(String id, String name, String description,
                                   MeasurementBlock measurements, QuestionBlock questions,
                                   String createdAt, String updatedAt) {}

    static final String COLUMNS = """
            id::text, name, description, measurements::text AS measurements,
            questions::text AS questions, created_at, updated_at
            """;

    // ── Reads ─────────────────────────────────────────────────────────────────

    public List<TemplateResponse> list(UUID trainerId) {
        return jdbc.queryForList("""
                SELECT %s FROM assessment_template
                WHERE trainer_id = :tid::uuid AND deleted_at IS NULL
                ORDER BY updated_at DESC, created_at ASC, id
                """.formatted(COLUMNS), Map.of("tid", trainerId.toString()))
                .stream().map(AssessmentTemplateService::toResponse).toList();
    }

    public TemplateResponse get(UUID trainerId, UUID id) {
        return toResponse(load(trainerId, id));
    }

    /** The row, or null when it is not the caller's live template — for callers that answer their own 400. */
    Map<String, Object> find(UUID trainerId, String id) {
        UUID parsed;
        try {
            parsed = UUID.fromString(id);
        } catch (Exception e) {
            return null;
        }
        var rows = jdbc.queryForList("""
                SELECT %s FROM assessment_template
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """.formatted(COLUMNS), Map.of("id", parsed.toString(), "tid", trainerId.toString()));
        return rows.isEmpty() ? null : rows.getFirst();
    }

    // ── Writes ────────────────────────────────────────────────────────────────

    @Transactional
    public TemplateResponse create(UUID trainerId, Map<String, Object> body) {
        var b = body == null ? Map.<String, Object>of() : body;
        UUID id = UUID.randomUUID();
        var p = new HashMap<String, Object>();
        p.put("id", id.toString());
        p.put("tid", trainerId.toString());
        p.put("name", name(b.get("name")));
        p.put("description", description(b.get("description")));
        p.put("measurements", write(measurements(b.get("measurements"))));
        p.put("questions", write(questions(b.get("questions"))));
        p.put("now", Timestamp.from(Instant.now()));
        jdbc.update("""
                INSERT INTO assessment_template (id, trainer_id, name, description, measurements,
                    questions, created_at, updated_at)
                VALUES (:id::uuid, :tid::uuid, :name, :description, CAST(:measurements AS jsonb),
                    CAST(:questions AS jsonb), :now, :now)
                """, p);
        return get(trainerId, id);
    }

    /** Whole-block replace of the fields present; an absent field is left alone. */
    @Transactional
    public TemplateResponse update(UUID trainerId, UUID id, Map<String, Object> body) {
        load(trainerId, id);
        if (body == null || body.isEmpty()) return get(trainerId, id);
        var sets = new ArrayList<String>();
        var p = new HashMap<String, Object>();
        p.put("id", id.toString());
        p.put("tid", trainerId.toString());
        if (body.containsKey("name")) { p.put("name", name(body.get("name"))); sets.add("name = :name"); }
        if (body.containsKey("description")) {
            p.put("description", description(body.get("description")));
            sets.add("description = :description");
        }
        if (body.containsKey("measurements")) {
            p.put("measurements", write(measurements(body.get("measurements"))));
            sets.add("measurements = CAST(:measurements AS jsonb)");
        }
        if (body.containsKey("questions")) {
            p.put("questions", write(questions(body.get("questions"))));
            sets.add("questions = CAST(:questions AS jsonb)");
        }
        if (!sets.isEmpty()) {
            sets.add("updated_at = now()");
            jdbc.update("UPDATE assessment_template SET " + String.join(", ", sets)
                    + " WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL", p);
        }
        return get(trainerId, id);
    }

    /**
     * Soft delete — and every assessment already sent from it SURVIVES, with its
     * {@code template_id} nulled in the same transaction. A sent assessment
     * stopped being the template the moment it went out; a cascade would delete
     * a client's answers because a trainer tidied their shelf.
     */
    @Transactional
    public void delete(UUID trainerId, UUID id) {
        load(trainerId, id);
        var p = Map.of("id", id.toString(), "tid", trainerId.toString());
        jdbc.update("""
                UPDATE assessment_template SET deleted_at = now(), updated_at = now()
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, p);
        jdbc.update("""
                UPDATE assessment SET template_id = NULL, updated_at = now()
                WHERE template_id = :id::uuid AND trainer_id = :tid::uuid
                """, p);
    }

    // ── Normalisation ─────────────────────────────────────────────────────────

    private static String name(Object raw) {
        if (!(raw instanceof String s) || s.isBlank()) throw AssessmentRuleException.validation("name: required");
        String v = s.strip();
        if (v.length() > MAX_NAME) throw AssessmentRuleException.validation("name: at most " + MAX_NAME + " characters");
        return v;
    }

    private static String description(Object raw) {
        if (!(raw instanceof String s) || s.isBlank()) return null;
        String v = s.strip();
        if (v.length() > MAX_DESCRIPTION) {
            throw AssessmentRuleException.validation("description: at most " + MAX_DESCRIPTION + " characters");
        }
        return v;
    }

    /** `{on, keys}` or a bare list; absent `on` is ON. */
    private static boolean blockOn(Object raw) {
        return !(raw instanceof Map<?, ?> m) || !m.containsKey("on") || !Boolean.FALSE.equals(m.get("on"));
    }

    private static Object blockList(Object raw, String key) {
        if (raw instanceof List<?>) return raw;
        if (raw instanceof Map<?, ?> m) return m.get(key);
        return List.of();
    }

    static MeasurementBlock measurements(Object raw) {
        var keys = new ArrayList<String>();
        if (blockList(raw, "keys") instanceof List<?> list) {
            for (Object v : list) {
                if (v instanceof String k && AssessmentCatalogue.BY_KEY.containsKey(k) && !keys.contains(k)) keys.add(k);
            }
        }
        return new MeasurementBlock(blockOn(raw), keys);
    }

    static QuestionBlock questions(Object raw) {
        var out = new ArrayList<AssessmentCatalogue.Question>();
        if (blockList(raw, "items") instanceof List<?> list) {
            if (list.size() > MAX_QUESTIONS) {
                throw AssessmentRuleException.validation("questions: at most " + MAX_QUESTIONS);
            }
            for (int i = 0; i < list.size(); i++) out.add(question(list.get(i), i));
        }
        return new QuestionBlock(blockOn(raw), out);
    }

    private static AssessmentCatalogue.Question question(Object entry, int i) {
        var q = entry instanceof Map<?, ?> m ? m : Map.of();
        String kind = q.get("kind") instanceof String k && KINDS.contains(k) ? k : "text";
        boolean isChoice = kind.equals("choice");
        Integer scale = null;
        if (kind.equals("rating")) {
            int asked = q.get("scale") instanceof Number n ? n.intValue() : 10;
            scale = SCALES.contains(asked) ? asked : 10;
        }
        var options = new ArrayList<AssessmentCatalogue.Option>();
        if (isChoice && q.get("options") instanceof List<?> opts) {
            if (opts.size() > MAX_OPTIONS) {
                throw AssessmentRuleException.validation("questions[" + i + "].options: at most " + MAX_OPTIONS);
            }
            for (int j = 0; j < opts.size(); j++) {
                var o = opts.get(j) instanceof Map<?, ?> om ? om : Map.of();
                String oid = o.get("id") instanceof String s && !s.isBlank() ? s.strip()
                        : String.valueOf((char) ('a' + (j % 26)));
                options.add(new AssessmentCatalogue.Option(oid, clip(o.get("text"), "")));
            }
        }
        String id = q.get("id") instanceof String s && !s.isBlank() ? s.strip()
                : "aq_" + UUID.randomUUID().toString().substring(0, 8);
        return new AssessmentCatalogue.Question(id, clip(q.get("text"), "Question " + (i + 1)), kind, scale,
                options, isChoice && Boolean.TRUE.equals(q.get("allowMultiple")),
                isChoice && Boolean.TRUE.equals(q.get("allowCustom")));
    }

    private static String clip(Object raw, String fallback) {
        if (!(raw instanceof String s) || s.isBlank()) return fallback;
        String v = s.strip();
        return v.length() > MAX_TEXT ? v.substring(0, MAX_TEXT) : v;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Map<String, Object> load(UUID trainerId, UUID id) {
        var row = find(trainerId, id.toString());
        if (row == null) throw AssessmentRuleException.templateNotFound();
        return row;
    }

    static TemplateResponse toResponse(Map<String, Object> r) {
        return new TemplateResponse(str(r.get("id")), str(r.get("name")), str(r.get("description")),
                readMeasurements(str(r.get("measurements"))), readQuestions(str(r.get("questions"))),
                iso(r.get("created_at")), iso(r.get("updated_at")));
    }

    public static MeasurementBlock readMeasurements(String json) {
        try {
            return JSON.readValue(Objects.requireNonNullElse(json, "{\"on\":true,\"keys\":[]}"), MeasurementBlock.class);
        } catch (Exception e) {
            return new MeasurementBlock(true, List.of());
        }
    }

    public static QuestionBlock readQuestions(String json) {
        try {
            return JSON.readValue(Objects.requireNonNullElse(json, "{\"on\":true,\"items\":[]}"),
                    new TypeReference<QuestionBlock>() {});
        } catch (Exception e) {
            return new QuestionBlock(true, List.of());
        }
    }

    static String write(Object v) {
        try {
            return JSON.writeValueAsString(v);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    static String str(Object v) { return v == null ? null : v.toString(); }

    /** ISO-8601 in UTC, or null. */
    static String iso(Object v) {
        if (v instanceof Timestamp ts)                 return ts.toInstant().toString();
        if (v instanceof java.time.OffsetDateTime odt) return odt.toInstant().toString();
        if (v instanceof Instant i)                    return i.toString();
        return null;
    }
}
