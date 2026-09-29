package com.inclineyou.inclineyou_backend.core.program;

import com.inclineyou.inclineyou_backend.core.template.TemplateService;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

/**
 * WHAT ONE CLIENT'S COPY SAYS THAT THE BLUEPRINT DOES NOT.
 *
 * The two-table design — `template` is the blueprint, `program` is the copy a
 * client is actually on — is what makes per-client coaching safe, and until this
 * class the API could not SAY what the difference was. It could only say
 * *behind*, which is a stamp comparison: it answers "has the blueprint moved
 * since this copy took it" and never "what did the trainer change for Meera".
 *
 * <p>The distinction is not academic, because the write on the other side of it
 * is destructive. {@code POST /v1/programs/{id}/resync} replaces the whole
 * prescription, so a trainer pushing a tidied blueprint to thirteen clients is
 * deleting per-client work they were never shown. This is the fact the push
 * panel needs in order to name it first.
 *
 * <p><b>Computed here rather than in the browser.</b> Thirteen assignments
 * diffed client-side is thirteen extra reads of a whole prescription to render
 * one panel, on a screen a trainer opens to make one decision.
 *
 * <h2>It diffs prescriptions, not rows</h2>
 *
 * A row's identity is its {@code id}, and a copy's ids are its own — they were
 * minted by {@code apply}, so no id in a program matches any id in a template
 * and an id-keyed diff would report every row as both added and removed. What a
 * trainer means by "the same exercise" is the same movement in the same lane, so
 * that is what is paired: within one (week, day), in order, by {@code exercise_id}.
 *
 * <h2>And a swap is one finding, not two</h2>
 *
 * <i>Bench Press → Dumbbell Press</i> is the most common per-client edit there
 * is — an injury, a busy rack, a missing bar — and reported as a removal plus an
 * addition it reads as two changes and loses the fact that one replaced the
 * other. A lane whose leftovers are exactly one of each is reported as a swap.
 *
 * <h2>The two days are different numbers, and this is where that is settled</h2>
 *
 * A template's {@code day_of_week} is an ORDINAL SLOT and a copy's is a
 * CONCRETE WEEKDAY — V24's translation, done once at apply through
 * {@code program.schedule}. Comparing them unmapped reports every row on both
 * sides of the ledger for a plan nobody has touched. {@link #between} takes the
 * client's schedule and translates the blueprint into their week before pairing
 * anything, which is the same thing {@code copyBlueprintInto} does to the rows.
 */
public final class PlanDiff {

    private PlanDiff() {}

    /** How many of each kind, and the lines a trainer reads. */
    public record Result(
            int added,
            int removed,
            int swapped,
            int changed,
            /** Cues written for this client — counted apart from the numbers. */
            int noted,
            /** Approved alternates set for this client. */
            int alts,
            /** Days, weeks and labels. Not a row at all. */
            int shape,
            int total,
            List<Line> lines
    ) {}

    /**
     * One difference, already rendered. The wire carries the SENTENCE rather
     * than the parts, because the two halves that read it — the push panel on
     * the web and the client's own plan screen — must not phrase one difference
     * two ways, and the exercise names it needs are a join this query is already
     * making.
     */
    public record Line(String kind, int week, int day, String text) {}

    public static final Result EMPTY = new Result(0, 0, 0, 0, 0, 0, 0, 0, List.of());

    /** A row as either side of the comparison holds it. */
    public record Row(
            String exerciseId,
            Integer dayOfWeek,
            Integer week,
            int orderIndex,
            Integer sets,
            Integer reps,
            Integer durationSeconds,
            Integer restSeconds,
            java.math.BigDecimal targetLoad,
            String tempo,
            String notes,
            String altExerciseId,
            List<TemplateService.SetDetail> setDetail
    ) {}

    /**
     * @param base      the blueprint, in the TEMPLATE's ordinal days
     * @param copy      the client's rows, in their own weekdays
     * @param bySlot    the client's schedule: ordinal slot → the weekday they chose
     * @param baseWeeks the blueprint's length, or null
     * @param copyWeeks this copy's length, or null
     * @param dayLabels the copy's day names, keyed by weekday — for the sentences
     * @param nameOf    exercise id → name. An id with no name reads as a neutral
     *                  word: a diff line is read aloud to nobody who knows what
     *                  a uuid is.
     */
    public static Result between(List<Row> base,
                                 List<Row> copy,
                                 Map<Integer, TemplateService.ScheduleEntry> bySlot,
                                 Integer baseWeeks,
                                 Integer copyWeeks,
                                 Map<String, String> dayLabels,
                                 java.util.function.Function<String, String> nameOf) {

        /* ── WHETHER WE KNOW WHAT A DAY IS CALLED ──────────────────────────
           FOUND ON REAL ROWS: a program with NO schedule — written before V24,
           or pushed by a phone — has nothing to translate through, so the
           blueprint's ordinal slots pass into the comparison unchanged. That is
           the correct PAIRING (both sides are then in the same numbering,
           whatever it is), and it made the SENTENCES lie: slot 1 was printed as
           *Monday* on a client nobody had ever scheduled.

           So a weekday name is only ever printed where a schedule says which
           weekday it is. Without one the neutral ordinal is the honest word, and
           it is the same one the blueprint's own board draws. */
        boolean weekdaysKnown = !bySlot.isEmpty();

        var translated = new ArrayList<Row>(base.size());
        for (Row r : base) {
            Integer slot = r.dayOfWeek();
            var landing = slot == null ? null : bySlot.get(slot);
            translated.add(landing == null ? r : withDay(r, landing.weekday()));
        }

        var lines = new ArrayList<Line>();
        int added = 0, removed = 0, swapped = 0, changed = 0, noted = 0, alts = 0, shape = 0;

        /* ── the shape ── */
        var baseDays = new TreeSet<Integer>();
        for (Row r : translated) if (r.dayOfWeek() != null) baseDays.add(r.dayOfWeek());
        var copyDays = new TreeSet<Integer>();
        for (Row r : copy) if (r.dayOfWeek() != null) copyDays.add(r.dayOfWeek());

        for (Integer d : copyDays) {
            if (!baseDays.contains(d)) {
                shape++;
                lines.add(new Line("shape", 0, 0, dayWord(d, dayLabels, weekdaysKnown) + " added"));
            }
        }
        for (Integer d : baseDays) {
            if (!copyDays.contains(d)) {
                shape++;
                lines.add(new Line("shape", 0, 0, dayWord(d, dayLabels, weekdaysKnown) + " removed"));
            }
        }
        if (baseWeeks != null && copyWeeks != null && !baseWeeks.equals(copyWeeks)) {
            shape++;
            lines.add(new Line("shape", 0, 0,
                    "Runs %d weeks, not %d".formatted(copyWeeks, baseWeeks)));
        }

        /* ── the rows, lane by lane ── */
        var baseLanes = lanes(translated);
        var copyLanes = lanes(copy);
        var keys = new TreeSet<String>(PlanDiff::compareLane);
        keys.addAll(baseLanes.keySet());
        keys.addAll(copyLanes.keySet());

        for (String key : keys) {
            int week = Integer.parseInt(key.split(":")[0]);
            int day  = Integer.parseInt(key.split(":")[1]);
            var theirs = baseLanes.getOrDefault(key, List.of());
            var mine   = new ArrayList<>(copyLanes.getOrDefault(key, List.of()));

            /* PAIRED BY MOVEMENT, IN ORDER — not by position. A row inserted at
               the top of a day would otherwise report every row under it as
               changed, which is four findings for one edit and none of them
               true. */
            var spareBase = new ArrayList<Row>();
            var taken = new boolean[mine.size()];
            for (Row before : theirs) {
                int at = -1;
                for (int i = 0; i < mine.size(); i++) {
                    if (!taken[i] && mine.get(i).exerciseId().equals(before.exerciseId())) { at = i; break; }
                }
                if (at < 0) { spareBase.add(before); continue; }
                taken[at] = true;
                Row after = mine.get(at);

                String wasRx = prescription(before);
                String nowRx = prescription(after);
                if (!wasRx.equals(nowRx)) {
                    changed++;
                    lines.add(new Line("changed", week, day,
                            "%s · %s %s — the plan says %s".formatted(
                                    dayWord(day, dayLabels, weekdaysKnown), nameOf.apply(after.exerciseId()), nowRx, wasRx)));
                }

                /* THE CUE, ON ITS OWN. `prescription` deliberately leaves
                   `notes` out: a cue written for one client is a real
                   difference and it is a different KIND from a rep count, and
                   folding it in reported every copy in the book as
                   re-prescribed against a blueprint it agreed with on every
                   number. */
                String wasNote = trim(before.notes());
                String nowNote = trim(after.notes());
                if (!wasNote.equals(nowNote)) {
                    noted++;
                    lines.add(new Line("note", week, day, nowNote.isEmpty()
                            ? "%s · %s — the cue was removed".formatted(
                                    dayWord(day, dayLabels, weekdaysKnown), nameOf.apply(after.exerciseId()))
                            : "%s · %s — “%s”%s".formatted(
                                    dayWord(day, dayLabels, weekdaysKnown), nameOf.apply(after.exerciseId()), nowNote,
                                    wasNote.isEmpty() ? "" : " (was a different cue)")));
                }

                String wasAlt = before.altExerciseId();
                String nowAlt = after.altExerciseId();
                if (!java.util.Objects.equals(wasAlt, nowAlt)) {
                    alts++;
                    lines.add(new Line("alt", week, day, nowAlt == null
                            ? "%s · %s — the alternate was removed".formatted(
                                    dayWord(day, dayLabels, weekdaysKnown), nameOf.apply(after.exerciseId()))
                            : "%s · %s — may do %s instead".formatted(
                                    dayWord(day, dayLabels, weekdaysKnown), nameOf.apply(after.exerciseId()),
                                    nameOf.apply(nowAlt))));
                }
            }

            var spareCopy = new ArrayList<Row>();
            for (int i = 0; i < mine.size(); i++) if (!taken[i]) spareCopy.add(mine.get(i));

            /* ONE OUT, ONE IN, SAME LANE — the injury swap, and it is one
               change. Only when the leftovers are exactly one of each: two and
               two is a day that was rewritten, and pairing those by position
               would invent a correspondence nobody wrote. */
            if (spareBase.size() == 1 && spareCopy.size() == 1) {
                swapped++;
                lines.add(new Line("swapped", week, day, "%s · %s → %s".formatted(
                        dayWord(day, dayLabels, weekdaysKnown),
                        nameOf.apply(spareBase.get(0).exerciseId()),
                        nameOf.apply(spareCopy.get(0).exerciseId()))));
            } else {
                for (Row r : spareCopy) {
                    added++;
                    lines.add(new Line("added", week, day, "%s · %s added — %s".formatted(
                            dayWord(day, dayLabels, weekdaysKnown), nameOf.apply(r.exerciseId()), prescription(r))));
                }
                for (Row r : spareBase) {
                    removed++;
                    lines.add(new Line("removed", week, day, "%s · %s removed".formatted(
                            dayWord(day, dayLabels, weekdaysKnown), nameOf.apply(r.exerciseId()))));
                }
            }
        }

        int total = added + removed + swapped + changed + noted + alts + shape;
        return new Result(added, removed, swapped, changed, noted, alts, shape, total, List.copyOf(lines));
    }

    // ── the parts ─────────────────────────────────────────────────────────────

    private static Row withDay(Row r, Integer day) {
        return new Row(r.exerciseId(), day, r.week(), r.orderIndex(), r.sets(), r.reps(),
                r.durationSeconds(), r.restSeconds(), r.targetLoad(), r.tempo(), r.notes(),
                r.altExerciseId(), r.setDetail());
    }

    /** `week:day`, which is the lane a row lives in. Nulls read as 1 and as day
     *  1 — the same reading the app's own `toEntries` gives them, so the diff
     *  and the board agree about where a day-less row sits. */
    private static Map<String, List<Row>> lanes(List<Row> rows) {
        var out = new LinkedHashMap<String, List<Row>>();
        for (Row r : rows) {
            String key = (r.week() == null ? 1 : r.week()) + ":" + (r.dayOfWeek() == null ? 1 : r.dayOfWeek());
            out.computeIfAbsent(key, k -> new ArrayList<>()).add(r);
        }
        for (var lane : out.values()) lane.sort(java.util.Comparator.comparingInt(Row::orderIndex));
        return out;
    }

    private static int compareLane(String a, String b) {
        String[] x = a.split(":"), y = b.split(":");
        int week = Integer.compare(Integer.parseInt(x[0]), Integer.parseInt(y[0]));
        return week != 0 ? week : Integer.compare(Integer.parseInt(x[1]), Integer.parseInt(y[1]));
    }

    private static final String[] WEEKDAYS =
            {"", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"};

    /**
     * *Monday · Upper A*, or *Monday* where the day has no name.
     *
     * The WEEKDAY and not "Day 3", because a copy's days are the client's real
     * week — the whole point of the translation at apply — and a trainer reading
     * a push panel is deciding about somebody's Thursday.
     *
     * <p>Except where nothing says which weekday it is: see {@code weekdaysKnown}
     * above. A name we cannot derive is a fact we would be inventing.
     */
    private static String dayWord(int day, Map<String, String> labels, boolean weekdaysKnown) {
        String name = weekdaysKnown && day >= 1 && day <= 7 ? WEEKDAYS[day] : "Day " + day;
        String label = labels == null ? null : labels.get(String.valueOf(day));
        return label == null || label.isBlank() ? name : name + " · " + label;
    }

    /**
     * `3 × 10 · 60s rest · @ 40 kg` — the app's own notation, short.
     *
     * What matters is that two rows whose prescriptions differ produce different
     * strings, and that the string reads the way a trainer says it. `notes` is
     * deliberately NOT in it; see the cue's own branch above.
     */
    static String prescription(Row r) {
        var parts = new ArrayList<String>();
        var detail = r.setDetail();
        if (detail != null && !detail.isEmpty()) {
            var runs = new ArrayList<String>();
            for (var set : detail) {
                runs.add(Boolean.TRUE.equals(set.toFailure()) ? "F"
                        : set.durationSeconds() != null ? set.durationSeconds() + "s"
                        : set.reps() != null ? String.valueOf(set.reps()) : "—");
            }
            parts.add(String.join(" · ", runs));
        } else {
            String work = r.durationSeconds() != null ? r.durationSeconds() + "s"
                    : r.reps() != null ? String.valueOf(r.reps()) : null;
            if (r.sets() != null && work != null) parts.add(r.sets() + " × " + work);
            else if (r.sets() != null) parts.add(r.sets() + " sets");
            else if (r.durationSeconds() != null) parts.add(r.durationSeconds() + "s");
            else if (r.reps() != null) parts.add(r.reps() + " reps");
        }
        if (r.targetLoad() != null) parts.add("@ " + r.targetLoad().stripTrailingZeros().toPlainString() + " kg");
        if (r.restSeconds() != null && r.restSeconds() != 0) parts.add(r.restSeconds() + "s rest");
        if (r.tempo() != null && !r.tempo().isBlank()) parts.add(r.tempo() + " tempo");
        return parts.isEmpty() ? "no prescription" : String.join(" · ", parts);
    }

    private static String trim(String s) { return s == null ? "" : s.trim(); }

    /** Every exercise either side names, for one `IN (...)` read of the library. */
    public static List<String> exerciseIds(List<Row> a, List<Row> b) {
        var out = new ArrayList<String>();
        var seen = new HashMap<String, Boolean>();
        for (var list : List.of(a, b)) {
            for (Row r : list) {
                if (r.exerciseId() != null && seen.putIfAbsent(r.exerciseId(), true) == null) out.add(r.exerciseId());
                if (r.altExerciseId() != null && seen.putIfAbsent(r.altExerciseId(), true) == null) out.add(r.altExerciseId());
            }
        }
        return out;
    }
}
