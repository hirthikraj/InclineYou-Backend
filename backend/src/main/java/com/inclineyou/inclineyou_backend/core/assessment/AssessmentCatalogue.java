package com.inclineyou.inclineyou_backend.core.assessment;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * V14 · what an assessment template may PICK from — twenty-one measurements and
 * an eleven-question bank. Fixed data in the strongest sense: a trainer cannot
 * add to it, because a measurement is only worth taking if it is taken the same
 * way twice, and the label is the protocol (<i>Waist, at the navel</i>).
 *
 * <p>Ported from the redesign's {@code mock/assessment-catalog.ts} with ONE
 * deliberate change: the six measurements V5's {@link MetricCatalogue} also
 * knows use V5's ids — {@code weight}, {@code body_fat}, {@code chest},
 * {@code waist}, {@code hip}, {@code arm} — where the mock said
 * {@code body_weight}, {@code hips} and {@code arm_right}. One measurement, one
 * spelling: this repo has paid for two spellings twice already ({@code acsm_cpt},
 * {@code fat_loss}). {@code metric} still names the V5 id, so it now equals
 * {@code key} on those six and is null on the rest.
 *
 * <h2>The health items are here by decision, and isolable</h2>
 *
 * {@link #HEALTH_MEASUREMENTS}, {@link #HEALTH_QUESTIONS} and the
 * {@code q_blockers} option {@code c} ("Illness") are health data under the
 * product's standing rule. They ship by the product owner's recorded decision
 * of 23 Sep 2026 ("include everything now, strip later if required"), and they
 * are named here so that withdrawing them is one change to this file.
 *
 * <p>Order inside a group is the order the tape goes round a body, top to
 * bottom. Question ids are stable strings, never indices: templates store them.
 */
public final class AssessmentCatalogue {

    private AssessmentCatalogue() {}

    public record Measurement(String key, String label, String group, String unit, String metric) {}

    public record Option(String id, String text) {}

    public record Question(String id, String text, String kind, Integer scale,
                           List<Option> options, boolean allowMultiple, boolean allowCustom) {}

    public static final List<String> GROUPS = List.of("Body composition", "Girths", "Vitals", "Movement");

    public static final List<Measurement> MEASUREMENTS = List.of(
            /* ── body composition ── */
            new Measurement("weight", "Body weight", "Body composition", "kg", "weight"),
            new Measurement("body_fat", "Body fat", "Body composition", "%", "body_fat"),
            new Measurement("muscle_mass", "Muscle mass", "Body composition", "kg", null),
            new Measurement("visceral", "Visceral fat", "Body composition", "", null),
            /* ── girths, top to bottom ── */
            new Measurement("neck", "Neck", "Girths", "cm", null),
            new Measurement("shoulders", "Shoulders", "Girths", "cm", null),
            new Measurement("chest", "Chest, at the nipple", "Girths", "cm", "chest"),
            new Measurement("arm_left", "Upper arm, left", "Girths", "cm", null),
            new Measurement("arm", "Upper arm, right", "Girths", "cm", "arm"),
            new Measurement("forearm", "Forearm, right", "Girths", "cm", null),
            new Measurement("waist", "Waist, at the navel", "Girths", "cm", "waist"),
            new Measurement("hip", "Hips, at the widest", "Girths", "cm", "hip"),
            new Measurement("thigh_left", "Thigh, left", "Girths", "cm", null),
            new Measurement("thigh_right", "Thigh, right", "Girths", "cm", null),
            new Measurement("calf_right", "Calf, right", "Girths", "cm", null),
            /* ── vitals ── */
            new Measurement("resting_hr", "Resting heart rate", "Vitals", "bpm", null),
            new Measurement("bp", "Blood pressure", "Vitals", "mmHg", null),
            /* ── movement ── */
            new Measurement("pushups", "Push-ups in 60 seconds", "Movement", "reps", null),
            // `seconds`, not `s`: a screen reader runs label and unit together.
            new Measurement("plank", "Plank hold", "Movement", "seconds", null),
            new Measurement("sit_reach", "Sit-and-reach", "Movement", "cm", null),
            new Measurement("ohs", "Overhead squat screen", "Movement", "out of 10", null));

    private static Question rating(String id, String text) {
        return new Question(id, text, "rating", 10, List.of(), false, false);
    }

    private static Question choice(String id, String text, boolean multiple, String... options) {
        var opts = new java.util.ArrayList<Option>();
        for (int i = 0; i < options.length; i++) opts.add(new Option(String.valueOf((char) ('a' + i)), options[i]));
        return new Question(id, text, "choice", null, List.copyOf(opts), multiple, false);
    }

    private static Question plain(String id, String kind, String text) {
        return new Question(id, text, kind, null, List.of(), false, false);
    }

    /** About the block that just finished, never about how the client feels today. */
    public static final List<Question> QUESTIONS = List.of(
            rating("q_progress", "How would you rate your overall progress this block?"),
            choice("q_consistency", "How consistent were you with your training sessions?", false,
                    "100% — hit every session", "75 to 99% — missed one or two",
                    "50 to 74% — missed several", "Below 50% — struggled to show up"),
            rating("q_energy", "How would you rate your energy and performance in the gym this block?"),
            rating("q_nutrition", "How well did you hit your nutrition targets (calories and protein)?"),
            rating("q_recovery", "How well did you recover between sessions? (sleep, soreness, fatigue)"),
            choice("q_sleep", "How many hours did you sleep on a typical night?", false,
                    "Under 5", "5 to 6", "7 to 8", "More than 8"),
            // The one question that takes several answers — work AND travel is the ordinary block.
            choice("q_blockers", "What got in the way most often?", true,
                    "Work", "Travel", "Illness", "Motivation", "Nothing, it was a clean block"),
            choice("q_difficulty", "How did the plan feel?", false,
                    "Too easy", "About right", "Hard but manageable", "Too hard"),
            plain("q_pain", "yesno", "Did anything hurt or feel off while training?"),
            plain("q_strongest", "text", "Which lift felt strongest this block?"),
            plain("q_next", "text", "What do you want to focus on next block?"));

    /** Health data kept by decision (23 Sep 2026) — see the class note. */
    public static final Set<String> HEALTH_MEASUREMENTS = Set.of("visceral", "resting_hr", "bp");
    public static final Set<String> HEALTH_QUESTIONS = Set.of("q_pain");

    /**
     * Out of v1 by the launch scope (WEB_LAUNCH.md — blood pressure and resting
     * heart rate wait for the release that can hold them). Still in
     * {@link #MEASUREMENTS} so an assessment already carrying one keeps reading;
     * {@link #OFFERED} is what the catalogue endpoint serves and a template write
     * accepts. Withdrawing the rest of the health items would be one more entry here.
     */
    public static final Set<String> HELD_BACK = Set.of("resting_hr", "bp");

    /**
     * The lower bound a reading may take — a typo guard, like {@link MetricCatalogue}'s ranges, not a judgement. Most of the
     * catalogue is a size or a mass, which is never 0. The counts and scores are honestly 0 for somebody (no push-up yet, a
     * plank not held, an overhead squat that scores nothing), and a sit-and-reach that stops short of the toes is negative.
     * Every reading stays below {@link #READING_BELOW}. {@code assessment_readings_valid} (V28) holds the same three rules.
     */
    public record Bound(BigDecimal min, boolean minInclusive) {
        public boolean allows(BigDecimal v) {
            if (v == null || v.compareTo(READING_BELOW) >= 0) return false;
            int c = v.compareTo(min);
            return minInclusive ? c >= 0 : c > 0;
        }

        public String rule() {
            String low = min.signum() == 0 ? "0" : String.format("%,d", min.longValue());
            return (minInclusive ? "must be " + low + " or more" : "must be above " + low) + " and below 100,000";
        }
    }

    public static final BigDecimal READING_BELOW = BigDecimal.valueOf(100_000);
    private static final Bound POSITIVE = new Bound(BigDecimal.ZERO, false);
    private static final Bound ZERO_OR_MORE = new Bound(BigDecimal.ZERO, true);
    private static final Bound SIGNED = new Bound(READING_BELOW.negate(), false);

    /** Counts and scores, where 0 is a result. */
    public static final Set<String> ZERO_ALLOWED = Set.of("pushups", "plank", "ohs");
    /** Measured from a mark, so short of it is negative. */
    public static final Set<String> NEGATIVE_ALLOWED = Set.of("sit_reach");

    /** A key the catalogue no longer knows (an old form) keeps the strict rule it was taken under. */
    public static Bound boundOf(String key) {
        if (NEGATIVE_ALLOWED.contains(key)) return SIGNED;
        if (ZERO_ALLOWED.contains(key)) return ZERO_OR_MORE;
        return POSITIVE;
    }

    /** What a template may ask in v1, in catalogue order. */
    public static final List<Measurement> OFFERED =
            MEASUREMENTS.stream().filter(m -> !HELD_BACK.contains(m.key())).toList();

    /** The groups that still have something in them — "Vitals" is empty while both are held back. */
    public static final List<String> OFFERED_GROUPS =
            GROUPS.stream().filter(g -> OFFERED.stream().anyMatch(m -> m.group().equals(g))).toList();

    public static final Map<String, Measurement> BY_KEY =
            MEASUREMENTS.stream().collect(Collectors.toUnmodifiableMap(Measurement::key, Function.identity()));
    public static final Map<String, Question> BANK =
            QUESTIONS.stream().collect(Collectors.toUnmodifiableMap(Question::id, Function.identity()));
}
