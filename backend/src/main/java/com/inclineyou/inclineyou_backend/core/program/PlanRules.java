package com.inclineyou.inclineyou_backend.core.program;

import com.inclineyou.inclineyou_backend.core.program.dto.ProgramRequest.ExerciseIn;
import com.inclineyou.inclineyou_backend.core.program.dto.ProgramRequest.SetIn;
import com.inclineyou.inclineyou_backend.core.program.dto.ProgramRequest.WorkoutIn;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;

import java.math.BigDecimal;
import java.util.*;
import java.util.function.Function;

/**
 * The rules of api-contract 1.1 Programs A1 that span more than one field, and
 * the normalisation a write needs: each field's own shape is Bean Validation on
 * {@code ProgramRequest}; what is left is here.
 *
 * <p>That is: a workout sits inside the program's weeks and days, a bodyweight set
 * has no load, a max set has no effort value, an id is used once, an alternative
 * has none of its own — and the output, a tree with every id minted and every
 * position re-derived. Checked before a row is written, so a bad set on workout
 * nine is a 400 that names it, not a check-constraint 500 after eight workouts
 * were half-written.
 */
public final class PlanRules {

    private PlanRules() {}

    /** A set, normalised. */
    public record S(UUID id, int position, String loadKind, BigDecimal load, String effortKind, BigDecimal effort,
             Integer rest, String tempo, String notes) {}

    /** An exercise, normalised; an alternative is one with no {@code alternatives} and no group or section. */
    public record E(UUID id, UUID exerciseId, int position, UUID groupId, String section, String notes,
             List<S> sets, List<E> alternatives) {}

    public record W(UUID id, String name, String notes, int week, int day, int position, List<E> exercises) {}

    public static List<W> tree(List<WorkoutIn> workouts, int weeks, int days) {
        if (workouts == null) return List.of();
        var seen = new HashSet<UUID>();
        var out = new ArrayList<W>();
        int i = 0;
        for (WorkoutIn w : workouts) {
            String at = "workouts[" + i++ + "]";
            if (w.week() > weeks) throw ApiException.validation(at + ".week: at most " + weeks + " (the program's length)");
            if (w.day() > days) throw ApiException.validation(at + ".day: at most " + days + " (the program's days a week)");
            var rows = new ArrayList<E>();
            for (ExerciseIn e : inOrder(w.exercises(), ExerciseIn::position)) {
                rows.add(exercise(e, at + ".exercises[" + rows.size() + "]", seen, true, rows.size()));
            }
            out.add(new W(id(w.id(), at + ".id", seen), w.name(), w.notes(), w.week(), w.day(),
                    w.position() == null ? Integer.MAX_VALUE : w.position(), rows));
        }
        // Positions are re-derived per (week, day): the order sent breaks ties, the gaps close up.
        var lane = new HashMap<String, Integer>();
        var sorted = new ArrayList<W>();
        out.stream().sorted(Comparator.comparingInt(W::week).thenComparingInt(W::day).thenComparingInt(W::position))
                .forEach(w -> sorted.add(new W(w.id(), w.name(), w.notes(), w.week(), w.day(),
                        lane.merge(w.week() + ":" + w.day(), 1, Integer::sum) - 1, w.exercises())));
        return sorted;
    }

    /**
     * A standalone workout's exercises (Programs A7): the same per-exercise rules as a program's
     * tree, with every id minted — nothing below the workout keeps one across a save.
     */
    public static List<E> exercises(List<ExerciseIn> exercises) {
        var seen = new HashSet<UUID>();
        var rows = new ArrayList<E>();
        for (ExerciseIn e : inOrder(exercises, ExerciseIn::position)) {
            rows.add(exercise(new ExerciseIn(null, e.exerciseId(), e.position(), e.groupId(), null, e.notes(),
                    e.sets() == null ? null : e.sets().stream().map(s -> new SetIn(null, s.position(), s.loadKind(),
                            s.loadValue(), s.effortKind(), s.effortValue(), s.restSeconds(), s.tempo(), s.notes())).toList(),
                    e.alternatives() == null ? null : e.alternatives().stream().map(a -> new ExerciseIn(null,
                            a.exerciseId(), a.position(), null, null, a.notes(),
                            a.sets() == null ? null : a.sets().stream().map(s -> new SetIn(null, s.position(),
                                    s.loadKind(), s.loadValue(), s.effortKind(), s.effortValue(), s.restSeconds(),
                                    s.tempo(), s.notes())).toList(), null)).toList()),
                    "exercises[" + rows.size() + "]", seen, true, rows.size()));
        }
        return rows;
    }

    private static E exercise(ExerciseIn e, String at, Set<UUID> seen, boolean main, int index) {
        var sets = new ArrayList<S>();
        for (SetIn s : inOrder(e.sets(), SetIn::position)) {
            sets.add(set(s, at + ".sets[" + sets.size() + "]", seen, sets.size() + 1));
        }
        var alts = new ArrayList<E>();
        if (main) {
            for (ExerciseIn alt : orEmpty(e.alternatives())) {
                E one = exercise(alt, at + ".alternatives[" + alts.size() + "]", seen, false, alts.size() + 1);
                alts.add(new E(one.id(), one.exerciseId(), alts.size() + 1, null, null, one.notes(), one.sets(), List.of()));
            }
        } else if (!orEmpty(e.alternatives()).isEmpty()) {
            throw ApiException.validation(at + ".alternatives: an alternative has none of its own");
        }
        return new E(id(e.id(), at + ".id", seen), e.exerciseId(), index, e.groupId(), e.section(), e.notes(), sets, alts);
    }

    private static S set(SetIn s, String at, Set<UUID> seen, int position) {
        String loadKind = s.loadKind() == null ? "weight" : s.loadKind();
        String effortKind = s.effortKind() == null ? "reps" : s.effortKind();
        if ("bodyweight".equals(loadKind) && s.loadValue() != null) {
            throw ApiException.validation(at + ".loadValue: a bodyweight set has no load");
        }
        if (effortKind.startsWith("max_") && s.effortValue() != null) {
            throw ApiException.validation(at + ".effortValue: a max set has no effort value");
        }
        return new S(id(s.id(), at + ".id", seen), position, loadKind, s.loadValue(), effortKind, s.effortValue(),
                s.restSeconds(), s.tempo(), s.notes());
    }

    /** The order sent, except that a caller-supplied position moves a row ahead of those without one. */
    private static <T> List<T> inOrder(List<T> rows, Function<T, Integer> position) {
        var sorted = new ArrayList<>(orEmpty(rows));
        sorted.sort(Comparator.comparingInt(r -> position.apply(r) == null ? Integer.MAX_VALUE : position.apply(r)));
        return sorted; // List.sort is stable: rows with no position keep the order they came in
    }

    private static <T> List<T> orEmpty(List<T> rows) {
        return rows == null ? List.of() : rows;
    }

    /** An id the caller sent, or a fresh one; twice in one request is a mistake, not a merge. */
    private static UUID id(UUID given, String field, Set<UUID> seen) {
        UUID id = given == null ? UUID.randomUUID() : given;
        if (!seen.add(id)) throw ApiException.validation(field + ": used twice in this request");
        return id;
    }

    /** Every exercise id the tree uses, alternatives included. */
    public static Set<UUID> exerciseIds(List<W> tree) {
        var ids = new LinkedHashSet<UUID>();
        for (W w : tree) {
            for (E e : w.exercises()) {
                ids.add(e.exerciseId());
                e.alternatives().forEach(a -> ids.add(a.exerciseId()));
            }
        }
        return ids;
    }
}
