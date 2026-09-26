package com.inclineyou.inclineyou_backend.workout;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

/**
 * V13 · a workout template — one reusable session, prescribed per SET.
 *
 * <h2>Normalised on write, so every reader can trust the blob</h2>
 *
 * The request is read as loose JSON and rebuilt field by field, because the
 * builder is a drag-and-drop board and its drafts are untidy by nature:
 * <ul>
 *   <li>an exercise's {@code orderIndex} is RE-DERIVED from array position and
 *       never read — the array is the order;</li>
 *   <li>its {@code id} is kept, or minted when absent;</li>
 *   <li>an unknown {@code loadKind} becomes {@code weight} and an unknown
 *       {@code effortKind} becomes {@code reps}; a value that is not a number is
 *       null; an empty {@code tempo} or {@code notes} is null;</li>
 *   <li>an alternative with no exercise, or with no sets, is dropped;</li>
 *   <li>a divider's {@code beforeIndex} is rounded and clamped to
 *       {@code [0, exercises.length]} — evaluated AFTER the exercises of the same
 *       body — an empty label drops it, and dividers are sorted by position;</li>
 *   <li>every {@code exerciseId}, alternatives included, must be a movement the
 *       caller can see: the catalogue or their own custom rows. Anything else is
 *       a {@code 400} naming the position, never a silently stored id that draws
 *       a blank card.</li>
 * </ul>
 *
 * {@code PUT} replaces each top-level field that is PRESENT, whole. There is no
 * per-exercise PATCH: two write granularities on one blob is how a half-saved
 * session happens.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class WorkoutTemplateService {

    private static final ObjectMapper JSON = new ObjectMapper();

    static final List<String> LOAD_KINDS = List.of(
            "percent_1rm", "level", "weight", "weight_range", "bodyweight", "rpe_level", "rpe_weight");
    static final List<String> EFFORT_KINDS = List.of(
            "max_reps", "max_time", "max_distance", "distance", "reps", "rep_interval", "time");

    private static final String DEFAULT_NAME = "New workout";
    private static final int MAX_NAME = 120;
    /* Ceilings on the blob, refused rather than truncated. Far past any real
       session — a sixty-movement workout is a program — and there so a client
       bug cannot write a megabyte into one row. */
    private static final int MAX_EXERCISES = 60;
    private static final int MAX_SETS = 30;
    private static final int MAX_ALTERNATIVES = 5;
    private static final int MAX_DIVIDERS = 30;
    private static final int MAX_TEXT = 500;

    private final NamedParameterJdbcTemplate jdbc;

    // ── Wire ──────────────────────────────────────────────────────────────────

    public record SetWire(String loadKind, Double loadValue, String effortKind, Double effortValue,
                          Integer restSeconds, String tempo, String notes) {}

    public record AlternativeWire(String exerciseId, List<SetWire> sets) {}

    public record ExerciseWire(String id, String exerciseId, int orderIndex, String groupId,
                               List<AlternativeWire> alternatives, List<SetWire> sets) {}

    public record DividerWire(String label, int beforeIndex) {}

    public record WorkoutTemplateResponse(
            String id,
            String name,
            String notes,
            List<ExerciseWire> exercises,
            List<DividerWire> dividers,
            long createdAt,
            long updatedAt,
            /** COUNTED on read, never stored. */
            int exerciseCount,
            /** Every set of every movement — alternatives are not counted, they replace a movement. */
            int setCount
    ) {}

    /**
     * POST / PUT body. Loose on purpose — see the class note. {@code exercises}
     * and {@code dividers} are left as JSON so an untidy draft is normalised
     * rather than refused by the binder.
     */
    public record WorkoutTemplateInput(
            String name,
            String notes,
            List<Map<String, Object>> exercises,
            List<Map<String, Object>> dividers
    ) {}

    // ── Reads ─────────────────────────────────────────────────────────────────

    /** The caller's rows, most recently touched first, in a total order. An empty account is []. */
    public List<WorkoutTemplateResponse> list(UUID trainerId) {
        return jdbc.queryForList("""
                SELECT id::text, name, notes, exercises::text AS exercises, dividers::text AS dividers,
                       created_at, updated_at
                FROM workout_template
                WHERE trainer_id = :tid::uuid AND deleted_at IS NULL
                ORDER BY updated_at DESC, created_at ASC, id
                """, Map.of("tid", trainerId.toString())).stream().map(this::toResponse).toList();
    }

    public WorkoutTemplateResponse get(UUID trainerId, UUID id) {
        return toResponse(load(trainerId, id));
    }

    // ── Writes ────────────────────────────────────────────────────────────────

    @Transactional
    public WorkoutTemplateResponse create(UUID trainerId, WorkoutTemplateInput req) {
        var in = req == null ? new WorkoutTemplateInput(null, null, null, null) : req;
        var exercises = normaliseExercises(trainerId, in.exercises());
        var dividers = normaliseDividers(in.dividers(), exercises.size());
        UUID id = UUID.randomUUID();
        var p = new HashMap<String, Object>();
        p.put("id",        id.toString());
        p.put("tid",       trainerId.toString());
        p.put("name",      name(in.name()));
        p.put("notes",     text(in.notes(), "notes"));
        p.put("exercises", write(exercises));
        p.put("dividers",  write(dividers));
        p.put("now",       Timestamp.from(Instant.now()));
        jdbc.update("""
                INSERT INTO workout_template (id, trainer_id, name, notes, exercises, dividers,
                    created_at, updated_at)
                VALUES (:id::uuid, :tid::uuid, :name, :notes, CAST(:exercises AS jsonb),
                    CAST(:dividers AS jsonb), :now, :now)
                """, p);
        return get(trainerId, id);
    }

    /**
     * Whole-body replace of the fields PRESENT. Dividers are clamped against the
     * exercises this body sends, or — when it sends none — against the ones
     * already stored, so a heading-only save cannot point past the end.
     */
    @Transactional
    public WorkoutTemplateResponse update(UUID trainerId, UUID id, WorkoutTemplateInput req) {
        var row = load(trainerId, id);
        var sets = new ArrayList<String>();
        var p = new HashMap<String, Object>();
        p.put("id",  id.toString());
        p.put("tid", trainerId.toString());
        if (req == null) return toResponse(row);

        if (req.name() != null)  { p.put("name", name(req.name())); sets.add("name = :name"); }
        if (req.notes() != null) { p.put("notes", text(req.notes(), "notes")); sets.add("notes = :notes"); }
        int exerciseTotal;
        if (req.exercises() != null) {
            var exercises = normaliseExercises(trainerId, req.exercises());
            exerciseTotal = exercises.size();
            p.put("exercises", write(exercises));
            sets.add("exercises = CAST(:exercises AS jsonb)");
        } else {
            exerciseTotal = readExercises(str(row.get("exercises"))).size();
        }
        if (req.dividers() != null) {
            p.put("dividers", write(normaliseDividers(req.dividers(), exerciseTotal)));
            sets.add("dividers = CAST(:dividers AS jsonb)");
        }
        if (!sets.isEmpty()) {
            sets.add("updated_at = now()");
            jdbc.update("UPDATE workout_template SET " + String.join(", ", sets)
                    + " WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL", p);
        }
        return get(trainerId, id);
    }

    /** Soft, like every delete here. Program rows are copies, so nothing cascades. */
    @Transactional
    public void delete(UUID trainerId, UUID id) {
        load(trainerId, id);
        jdbc.update("""
                UPDATE workout_template SET deleted_at = now(), updated_at = now()
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("id", id.toString(), "tid", trainerId.toString()));
    }

    // ── Normalisation ─────────────────────────────────────────────────────────

    private List<ExerciseWire> normaliseExercises(UUID trainerId, List<Map<String, Object>> raw) {
        if (raw == null) return List.of();
        if (raw.size() > MAX_EXERCISES) {
            throw WorkoutRuleException.validation("exercises: at most " + MAX_EXERCISES + " movements in one workout");
        }
        var out = new ArrayList<ExerciseWire>(raw.size());
        var referenced = new LinkedHashMap<String, String>();   // exerciseId → where it was named
        for (int i = 0; i < raw.size(); i++) {
            var e = raw.get(i);
            if (e == null) continue;
            String where = "exercises[" + i + "]";
            String exerciseId = uuidText(e.get("exerciseId"), where + ".exerciseId");
            if (exerciseId == null) throw WorkoutRuleException.validation(where + ".exerciseId: required");
            referenced.putIfAbsent(exerciseId, where + ".exerciseId");

            var alternatives = new ArrayList<AlternativeWire>();
            if (e.get("alternatives") instanceof List<?> alts) {
                for (int a = 0; a < alts.size(); a++) {
                    if (!(alts.get(a) instanceof Map<?, ?> alt)) continue;
                    String altWhere = where + ".alternatives[" + a + "]";
                    String altId = uuidText(alt.get("exerciseId"), altWhere + ".exerciseId");
                    var altSets = sets(alt.get("sets"), altWhere);
                    // An alternative with nothing to do instead is not an alternative.
                    if (altId == null || altSets.isEmpty()) continue;
                    referenced.putIfAbsent(altId, altWhere + ".exerciseId");
                    alternatives.add(new AlternativeWire(altId, altSets));
                }
            }
            if (alternatives.size() > MAX_ALTERNATIVES) {
                throw WorkoutRuleException.validation(where + ".alternatives: at most " + MAX_ALTERNATIVES);
            }
            String id = e.get("id") instanceof String s && !s.isBlank() ? s.strip() : UUID.randomUUID().toString();
            if (id.length() > 64) id = id.substring(0, 64);
            String groupId = e.get("groupId") instanceof String g && !g.isBlank() ? g.strip() : null;
            out.add(new ExerciseWire(id, exerciseId, out.size(), groupId, alternatives, sets(e.get("sets"), where)));
        }
        requireVisible(trainerId, referenced);
        return out;
    }

    private List<SetWire> sets(Object raw, String where) {
        if (!(raw instanceof List<?> list)) return List.of();
        if (list.size() > MAX_SETS) throw WorkoutRuleException.validation(where + ".sets: at most " + MAX_SETS);
        var out = new ArrayList<SetWire>(list.size());
        for (Object o : list) {
            if (!(o instanceof Map<?, ?> s)) continue;
            String load = s.get("loadKind") instanceof String k && LOAD_KINDS.contains(k) ? k : "weight";
            String effort = s.get("effortKind") instanceof String k && EFFORT_KINDS.contains(k) ? k : "reps";
            Double rest = number(s.get("restSeconds"));
            out.add(new SetWire(load, number(s.get("loadValue")), effort, number(s.get("effortValue")),
                    rest == null ? null : (int) Math.round(rest),
                    text(s.get("tempo") instanceof String t ? t : null, where + ".tempo"),
                    text(s.get("notes") instanceof String n ? n : null, where + ".notes")));
        }
        return out;
    }

    private List<DividerWire> normaliseDividers(List<Map<String, Object>> raw, int exerciseTotal) {
        if (raw == null) return List.of();
        if (raw.size() > MAX_DIVIDERS) throw WorkoutRuleException.validation("dividers: at most " + MAX_DIVIDERS);
        var out = new ArrayList<DividerWire>();
        for (var d : raw) {
            if (d == null || !(d.get("label") instanceof String label) || label.isBlank()) continue;
            Double at = number(d.get("beforeIndex"));
            int index = at == null ? 0 : (int) Math.round(at);
            index = Math.max(0, Math.min(exerciseTotal, index));
            String l = label.strip();
            out.add(new DividerWire(l.length() > 120 ? l.substring(0, 120) : l, index));
        }
        // Stable: two headings before the same movement keep the order they were sent in.
        out.sort(Comparator.comparingInt(DividerWire::beforeIndex));
        return out;
    }

    /** Every named movement must be the catalogue's or the caller's own — one query for all of them. */
    private void requireVisible(UUID trainerId, Map<String, String> referenced) {
        if (referenced.isEmpty()) return;
        var visible = new HashSet<>(jdbc.queryForList("""
                SELECT id::text FROM exercise
                WHERE id::text IN (:ids) AND deleted_at IS NULL
                  AND (is_custom = false OR trainer_id = :tid::uuid)
                """, Map.of("ids", referenced.keySet(), "tid", trainerId.toString()), String.class));
        for (var e : referenced.entrySet()) {
            if (!visible.contains(e.getKey())) {
                throw WorkoutRuleException.validation(e.getValue() + ": not a movement in your library");
            }
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Map<String, Object> load(UUID trainerId, UUID id) {
        var rows = jdbc.queryForList("""
                SELECT id::text, name, notes, exercises::text AS exercises, dividers::text AS dividers,
                       created_at, updated_at
                FROM workout_template
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("id", id.toString(), "tid", trainerId.toString()));
        if (rows.isEmpty()) throw WorkoutRuleException.notFound();
        return rows.getFirst();
    }

    private WorkoutTemplateResponse toResponse(Map<String, Object> r) {
        var exercises = readExercises(str(r.get("exercises")));
        List<DividerWire> dividers;
        try {
            dividers = JSON.readValue(Objects.requireNonNullElse(str(r.get("dividers")), "[]"), new TypeReference<>() {});
        } catch (Exception e) {
            dividers = List.of();
        }
        int setCount = exercises.stream().mapToInt(x -> x.sets() == null ? 0 : x.sets().size()).sum();
        return new WorkoutTemplateResponse(str(r.get("id")), str(r.get("name")), str(r.get("notes")),
                exercises, dividers, epochMilli(r.get("created_at")), epochMilli(r.get("updated_at")),
                exercises.size(), setCount);
    }

    private List<ExerciseWire> readExercises(String json) {
        try {
            return JSON.readValue(Objects.requireNonNullElse(json, "[]"), new TypeReference<>() {});
        } catch (Exception e) {
            log.warn("Unreadable workout template blob: {}", e.getMessage());
            return List.of();
        }
    }

    private static String name(String raw) {
        if (raw == null || raw.isBlank()) return DEFAULT_NAME;
        String v = raw.strip();
        if (v.length() > MAX_NAME) throw WorkoutRuleException.validation("name: at most " + MAX_NAME + " characters");
        return v;
    }

    private static String text(String raw, String field) {
        if (raw == null || raw.isBlank()) return null;
        String v = raw.strip();
        if (v.length() > MAX_TEXT) throw WorkoutRuleException.validation(field + ": at most " + MAX_TEXT + " characters");
        return v;
    }

    /** A finite number, or null — "numbers must be numbers" (a numeric string is not one). */
    private static Double number(Object v) {
        if (v instanceof Number n) {
            double d = n.doubleValue();
            return Double.isFinite(d) ? d : null;
        }
        return null;
    }

    /** A UUID string, or null when absent/blank; a present value that is not a UUID is a 400. */
    private static String uuidText(Object v, String where) {
        if (!(v instanceof String s) || s.isBlank()) return null;
        try {
            return UUID.fromString(s.strip()).toString();
        } catch (IllegalArgumentException e) {
            throw WorkoutRuleException.validation(where + ": not an exercise id");
        }
    }

    private static String write(Object value) {
        try {
            return JSON.writeValueAsString(value);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static String str(Object v) { return v == null ? null : v.toString(); }

    private static long epochMilli(Object v) {
        if (v instanceof Timestamp ts)                 return ts.toInstant().toEpochMilli();
        if (v instanceof java.time.OffsetDateTime odt) return odt.toInstant().toEpochMilli();
        if (v instanceof Instant i)                    return i.toEpochMilli();
        return 0L;
    }
}
