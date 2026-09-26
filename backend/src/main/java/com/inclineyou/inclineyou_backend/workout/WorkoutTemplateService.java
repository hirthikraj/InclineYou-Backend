package com.inclineyou.inclineyou_backend.workout;

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
 * V13 · a workout template — one reusable session, prescribed per SET.
 *
 * <h2>Normalised on write, so every reader can trust the shape</h2>
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
 *   <li>a divider's {@code beforeIndex} is rounded and clamped, an empty label
 *       drops it, and dividers are sorted by position;</li>
 *   <li>every {@code exerciseId}, alternatives included, must be a movement the
 *       caller can see: the catalogue or their own custom rows. Anything else is
 *       a {@code 400} naming the position, never a silently stored id that draws
 *       a blank card.</li>
 * </ul>
 *
 * {@code PUT} replaces each top-level field that is PRESENT, whole. There is no
 * per-exercise PATCH: two write granularities on one blob is how a half-saved
 * session happens.
 *
 * <h2>The 25 Sep 2026 schema rebuild</h2>
 *
 * This used to be one row with the whole board serialised into an
 * {@code exercises}/{@code dividers} JSONB pair on a {@code workout_template}
 * table of its own. Both are gone: a saved workout is now the same {@code
 * workout} row a program's applied day gets (distinguished by {@code
 * program_id IS NULL}), with {@code workout_exercise} and {@code workout_set}
 * underneath it. Two shapes changed, not just names:
 *
 * <ul>
 *   <li>an alternative is its own {@code workout_exercise} row
 *       ({@code alternative_of} pointing at the main row), and
 *       {@code workout_exercise_alternative} caps it at TWO — this class's old
 *       ceiling of five is gone, because the database itself refuses a third;</li>
 *   <li>a divider is no longer a free-floating {@code (label, beforeIndex)} —
 *       there is no column left to hold one that is not attached to a row. It is
 *       stored as {@code section} on whichever exercise it precedes, so a
 *       divider needs a row to sit in front of: one past the last exercise (the
 *       old model's trailing heading) has nowhere to go and clamps to the LAST
 *       exercise instead of past it. {@code beforeIndex} on read is that row's
 *       position.</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class WorkoutTemplateService {

    static final List<String> LOAD_KINDS = List.of(
            "percent_1rm", "level", "weight", "weight_range", "bodyweight", "rpe_level", "rpe_weight");
    static final List<String> EFFORT_KINDS = List.of(
            "max_reps", "max_time", "max_distance", "distance", "reps", "rep_interval", "time");

    private static final String DEFAULT_NAME = "New workout";
    private static final int MAX_NAME = 120;
    /* Ceilings on the board, refused rather than truncated. Far past any real
       session — a sixty-movement workout is a program — and there so a client
       bug cannot write a megabyte into one row. */
    private static final int MAX_EXERCISES = 60;
    private static final int MAX_SETS = 30;
    /** {@code workout_exercise_alternative}: an alternative row's position is 1 or 2. */
    private static final int MAX_ALTERNATIVES = 2;
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
     * and {@code dividers} are read as loose maps so an untidy draft is
     * normalised rather than refused by the binder.
     */
    public record WorkoutTemplateInput(
            String name,
            String notes,
            List<Map<String, Object>> exercises,
            List<Map<String, Object>> dividers
    ) {}

    /**
     * One exercise row mid-assembly, before its alternatives/sets are attached.
     * {@code wireId} is the drag-and-drop board's own client-generated key
     * ({@code ExerciseWire.id}) — never the DB row's own uuid, and not
     * necessarily a UUID at all ("keep-me" is a legal one), so it cannot live
     * in a {@code uuid} column. There is no purpose-built column for it on
     * {@code workout_exercise}, and {@code notes} is otherwise unused by this
     * feature (only a set has a notes field on the wire), so it rides there.
     */
    private record Row(String rowId, String wireId, String exerciseId, int position, String alternativeOf,
                        String groupId, String section, List<SetWire> sets) {}

    // ── Reads ─────────────────────────────────────────────────────────────────

    /** The caller's rows, most recently touched first, in a total order. An empty account is []. */
    public List<WorkoutTemplateResponse> list(UUID trainerId) {
        var workouts = jdbc.queryForList("""
                SELECT id::text, name, notes, created_at, updated_at
                FROM workout
                WHERE trainer_id = :tid::uuid AND program_id IS NULL AND deleted_at IS NULL
                ORDER BY updated_at DESC, created_at ASC, id
                """, Map.of("tid", trainerId.toString()));
        if (workouts.isEmpty()) return List.of();

        var ids = workouts.stream().map(w -> (String) w.get("id")).toList();
        var rowsByWorkout = loadRows(ids);
        return workouts.stream().map(w -> assemble(w, rowsByWorkout.getOrDefault(w.get("id"), List.of()))).toList();
    }

    public WorkoutTemplateResponse get(UUID trainerId, UUID id) {
        var w = loadWorkout(trainerId, id);
        var rows = loadRows(List.of(id.toString())).getOrDefault(id.toString(), List.of());
        return assemble(w, rows);
    }

    // ── Writes ────────────────────────────────────────────────────────────────

    @Transactional
    public WorkoutTemplateResponse create(UUID trainerId, WorkoutTemplateInput req) {
        var in = req == null ? new WorkoutTemplateInput(null, null, null, null) : req;
        var exercises = normaliseExercises(trainerId, in.exercises());
        var dividers = normaliseDividers(in.dividers(), exercises.size());
        UUID id = UUID.randomUUID();
        var p = new HashMap<String, Object>();
        p.put("id",    id.toString());
        p.put("tid",   trainerId.toString());
        p.put("name",  name(in.name()));
        p.put("notes", text(in.notes(), "notes"));
        p.put("now",   Timestamp.from(Instant.now()));
        jdbc.update("""
                INSERT INTO workout (id, origin, trainer_id, name, notes, created_at, updated_at)
                VALUES (:id::uuid, 'trainer', :tid::uuid, :name, :notes, :now, :now)
                """, p);
        writeExercises(id, exercises, dividers);
        return get(trainerId, id);
    }

    /**
     * Whole-body replace of the fields PRESENT. Dividers not resent are
     * reclamped against whatever the new exercise count is (or left as they
     * are, when exercises are not resent either).
     */
    @Transactional
    public WorkoutTemplateResponse update(UUID trainerId, UUID id, WorkoutTemplateInput req) {
        var w = loadWorkout(trainerId, id);
        if (req == null) return get(trainerId, id);

        var sets = new ArrayList<String>();
        var p = new HashMap<String, Object>();
        p.put("id",  id.toString());
        p.put("tid", trainerId.toString());
        if (req.name() != null)  { p.put("name", name(req.name())); sets.add("name = :name"); }
        if (req.notes() != null) { p.put("notes", text(req.notes(), "notes")); sets.add("notes = :notes"); }
        if (!sets.isEmpty()) {
            sets.add("updated_at = now()");
            jdbc.update("UPDATE workout SET " + String.join(", ", sets)
                    + " WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL", p);
        }

        if (req.exercises() != null || req.dividers() != null) {
            var currentRows = loadRows(List.of(id.toString())).getOrDefault(id.toString(), List.of());
            List<ExerciseWire> exercises = req.exercises() != null
                    ? normaliseExercises(trainerId, req.exercises())
                    : toExerciseWires(currentRows);
            List<DividerWire> dividers = req.dividers() != null
                    ? normaliseDividers(req.dividers(), exercises.size())
                    : normaliseDividers(currentDividers(currentRows), exercises.size());
            writeExercises(id, exercises, dividers);
        }
        return get(trainerId, id);
    }

    /** Soft, like every delete here. A program's applied copy is its own row, so nothing cascades. */
    @Transactional
    public void delete(UUID trainerId, UUID id) {
        loadWorkout(trainerId, id);
        jdbc.update("""
                UPDATE workout SET deleted_at = now(), updated_at = now()
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("id", id.toString(), "tid", trainerId.toString()));
    }

    // ── Persisting the board ─────────────────────────────────────────────────

    /**
     * Replaces every {@code workout_exercise} row under this workout — the alternates
     * and sets cascade off that delete ({@code ON DELETE CASCADE}) — and writes the
     * new board. Dividers are folded onto whichever main row now sits at their
     * (already-clamped) position; one clamped past the last exercise cannot occur,
     * since {@link #normaliseDividers} never returns an index the current
     * exercise list does not have a row for.
     */
    private void writeExercises(UUID workoutId, List<ExerciseWire> exercises, List<DividerWire> dividers) {
        jdbc.update("DELETE FROM workout_exercise WHERE workout_id = :wid::uuid",
                Map.of("wid", workoutId.toString()));

        var sectionByPosition = new HashMap<Integer, String>();
        for (var d : dividers) sectionByPosition.merge(d.beforeIndex(), d.label(), (a, b) -> a + "\n" + b);

        var groupIds = new HashMap<String, UUID>();
        int position = 0;
        for (var ex : exercises) {
            UUID groupId = ex.groupId() == null ? null : groupIds.computeIfAbsent(ex.groupId(), k -> UUID.randomUUID());
            UUID mainRowId = insertWorkoutExercise(workoutId, ex.id(), ex.exerciseId(), position, null,
                    groupId, sectionByPosition.get(position), ex.sets());
            int altPosition = 1;
            for (var alt : ex.alternatives()) {
                insertWorkoutExercise(workoutId, null, alt.exerciseId(), altPosition, mainRowId, null, null, alt.sets());
                altPosition++;
            }
            position++;
        }
    }

    private UUID insertWorkoutExercise(UUID workoutId, String wireId, String exerciseId, int position, UUID alternativeOf,
                                        UUID groupId, String section, List<SetWire> sets) {
        UUID id = UUID.randomUUID();
        var p = new HashMap<String, Object>();
        p.put("id",      id.toString());
        p.put("wid",     workoutId.toString());
        p.put("exid",    exerciseId);
        p.put("pos",     position);
        p.put("alt",     alternativeOf == null ? null : alternativeOf.toString());
        p.put("grp",     groupId == null ? null : groupId.toString());
        p.put("section", section);
        p.put("notes",   wireId);
        jdbc.update("""
                INSERT INTO workout_exercise (id, workout_id, exercise_id, position, alternative_of, group_id, section, notes)
                VALUES (:id::uuid, :wid::uuid, :exid::uuid, :pos, :alt::uuid, :grp::uuid, :section, :notes)
                """, p);

        int setPosition = 1;
        for (var s : sets) {
            var sp = new HashMap<String, Object>();
            sp.put("id",          UUID.randomUUID().toString());
            sp.put("weid",        id.toString());
            sp.put("pos",         setPosition);
            sp.put("loadKind",    s.loadKind());
            sp.put("loadValue",   s.loadValue() == null ? null : BigDecimal.valueOf(s.loadValue()));
            sp.put("effortKind",  s.effortKind());
            sp.put("effortValue", s.effortValue() == null ? null : BigDecimal.valueOf(s.effortValue()));
            sp.put("rest",        s.restSeconds());
            sp.put("tempo",       s.tempo());
            sp.put("notes",       s.notes());
            jdbc.update("""
                    INSERT INTO workout_set (id, workout_exercise_id, position, load_kind, load_value,
                        effort_kind, effort_value, rest_seconds, tempo, notes)
                    VALUES (:id::uuid, :weid::uuid, :pos, :loadKind, :loadValue,
                        :effortKind, :effortValue, :rest, :tempo, :notes)
                    """, sp);
            setPosition++;
        }
        return id;
    }

    // ── Reading the board back ───────────────────────────────────────────────

    private Map<String, Object> loadWorkout(UUID trainerId, UUID id) {
        var rows = jdbc.queryForList("""
                SELECT id::text, name, notes, created_at, updated_at
                FROM workout
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND program_id IS NULL AND deleted_at IS NULL
                """, Map.of("id", id.toString(), "tid", trainerId.toString()));
        if (rows.isEmpty()) throw WorkoutRuleException.notFound();
        return rows.getFirst();
    }

    /** Every {@code workout_exercise} row for these workouts, with its sets attached, grouped by workout id. */
    private Map<Object, List<Row>> loadRows(List<String> workoutIds) {
        var exerciseRows = jdbc.queryForList("""
                SELECT id::text, workout_id::text AS workout_id, exercise_id::text AS exercise_id, position,
                       alternative_of::text AS alternative_of, group_id::text AS group_id, section, notes
                FROM workout_exercise
                WHERE workout_id::text IN (:ids)
                ORDER BY workout_id, position
                """, Map.of("ids", workoutIds));
        if (exerciseRows.isEmpty()) return Map.of();

        var rowIds = exerciseRows.stream().map(r -> (String) r.get("id")).toList();
        var setsByRow = new HashMap<String, List<SetWire>>();
        jdbc.queryForList("""
                SELECT workout_exercise_id::text AS weid, load_kind, load_value, effort_kind, effort_value,
                       rest_seconds, tempo, notes
                FROM workout_set
                WHERE workout_exercise_id::text IN (:ids)
                ORDER BY workout_exercise_id, position
                """, Map.of("ids", rowIds)).forEach(r -> setsByRow
                .computeIfAbsent((String) r.get("weid"), k -> new ArrayList<>())
                .add(new SetWire(
                        str(r.get("load_kind")), decimal(r.get("load_value")),
                        str(r.get("effort_kind")), decimal(r.get("effort_value")),
                        r.get("rest_seconds") == null ? null : ((Number) r.get("rest_seconds")).intValue(),
                        str(r.get("tempo")), str(r.get("notes")))));

        var byWorkout = new LinkedHashMap<Object, List<Row>>();
        for (var r : exerciseRows) {
            String rowId = (String) r.get("id");
            String wireId = (String) r.get("notes");
            byWorkout.computeIfAbsent(r.get("workout_id"), k -> new ArrayList<>()).add(new Row(
                    rowId, wireId == null ? rowId : wireId, (String) r.get("exercise_id"),
                    ((Number) r.get("position")).intValue(),
                    (String) r.get("alternative_of"), (String) r.get("group_id"), (String) r.get("section"),
                    setsByRow.getOrDefault(rowId, List.of())));
        }
        return byWorkout;
    }

    private WorkoutTemplateResponse assemble(Map<String, Object> w, List<Row> rows) {
        var exercises = toExerciseWires(rows);
        var dividers = new ArrayList<DividerWire>();
        int position = 0;
        for (var r : rows) {
            if (r.alternativeOf() == null) {
                // Two headings stacked on the same movement share one `section`
                // string, newline-joined on write — split back into separate
                // dividers here so a stack round-trips as the same count it went in as.
                if (r.section() != null) for (var label : r.section().split("\n")) dividers.add(new DividerWire(label, position));
                position++;
            }
        }
        int setCount = exercises.stream().mapToInt(x -> x.sets().size()).sum();
        return new WorkoutTemplateResponse(str(w.get("id")), str(w.get("name")), str(w.get("notes")),
                exercises, dividers, epochMilli(w.get("created_at")), epochMilli(w.get("updated_at")),
                exercises.size(), setCount);
    }

    private List<ExerciseWire> toExerciseWires(List<Row> rows) {
        // Keyed by the DB row id — the only thing `alternative_of` can point at —
        // never by the wire id, which is exposed but is not a foreign key.
        var alternativesByMainRowId = new HashMap<String, List<AlternativeWire>>();
        for (var r : rows) {
            if (r.alternativeOf() != null) {
                alternativesByMainRowId.computeIfAbsent(r.alternativeOf(), k -> new ArrayList<>())
                        .add(new AlternativeWire(r.exerciseId(), r.sets()));
            }
        }
        var out = new ArrayList<ExerciseWire>();
        int position = 0;
        for (var r : rows) {
            if (r.alternativeOf() == null) {
                out.add(new ExerciseWire(r.wireId(), r.exerciseId(), position, r.groupId(),
                        alternativesByMainRowId.getOrDefault(r.rowId(), List.of()), r.sets()));
                position++;
            }
        }
        return out;
    }

    /** The dividers currently stored, read back off the rows' {@code section}, for a reclamp that resent none. */
    private List<Map<String, Object>> currentDividers(List<Row> rows) {
        var out = new ArrayList<Map<String, Object>>();
        int position = 0;
        for (var r : rows) {
            if (r.alternativeOf() == null) {
                if (r.section() != null) {
                    for (String label : r.section().split("\n")) out.add(Map.of("label", label, "beforeIndex", position));
                }
                position++;
            }
        }
        return out;
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

    /**
     * Rounded, blank dropped, sorted; clamped to {@code [0, exerciseTotal - 1]} —
     * a divider needs a row to sit in front of, so with no exercises at all
     * every divider is dropped, and one past the last exercise clamps to the
     * last rather than floating past the end.
     */
    private List<DividerWire> normaliseDividers(List<Map<String, Object>> raw, int exerciseTotal) {
        if (raw == null || exerciseTotal <= 0) return List.of();
        if (raw.size() > MAX_DIVIDERS) throw WorkoutRuleException.validation("dividers: at most " + MAX_DIVIDERS);
        var out = new ArrayList<DividerWire>();
        for (var d : raw) {
            if (d == null || !(d.get("label") instanceof String label) || label.isBlank()) continue;
            Double at = number(d.get("beforeIndex"));
            int index = at == null ? 0 : (int) Math.round(at);
            index = Math.max(0, Math.min(exerciseTotal - 1, index));
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
                  AND (origin = 'inclineyou' OR trainer_id = :tid::uuid)
                """, Map.of("ids", referenced.keySet(), "tid", trainerId.toString()), String.class));
        for (var e : referenced.entrySet()) {
            if (!visible.contains(e.getKey())) {
                throw WorkoutRuleException.validation(e.getValue() + ": not a movement in your library");
            }
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

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

    private static String str(Object v) { return v == null ? null : v.toString(); }

    private static Double decimal(Object v) {
        if (v instanceof Number n) return n.doubleValue();
        return null;
    }

    private static long epochMilli(Object v) {
        if (v instanceof Timestamp ts)                 return ts.toInstant().toEpochMilli();
        if (v instanceof java.time.OffsetDateTime odt) return odt.toInstant().toEpochMilli();
        if (v instanceof Instant i)                    return i.toEpochMilli();
        return 0L;
    }
}
