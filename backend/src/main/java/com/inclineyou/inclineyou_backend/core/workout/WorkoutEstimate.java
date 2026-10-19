package com.inclineyou.inclineyou_backend.core.workout;

import java.util.List;

/**
 * How long a written session takes, in whole minutes — the {@code estimatedMinutes} the shelf row prints.
 *
 * <p><b>This is a copy, and it has a twin.</b> The rule is {@code web app/web/lib/workouts/estimate.ts}, which the
 * builder runs on a draft that has never been saved and so cannot ask the server. The shelf asks the server instead,
 * because the list no longer carries the sets (19 Oct 2026: a phone on mobile data was downloading every set of every
 * template to print one number per row). Change one, change the other in the same commit, or the row and the builder
 * print two durations for one workout. {@code WorkoutEstimateTest} pins the cases both must agree on.
 *
 * <p>Pure: no clock, no request, nothing read.
 */
public final class WorkoutEstimate {

    /** What a rep costs, in seconds. */
    private static final int SECONDS_PER_REP = 3;
    /** Getting to the rack and loading it; paid once per exercise, not per set. */
    private static final int SETUP_SECONDS = 45;
    /** A set with no rest written still costs something before the next one. */
    private static final int DEFAULT_REST_SECONDS = 60;

    private WorkoutEstimate() {}

    /** One set's effort and rest, as {@code workout_set} stores them. */
    public record Effort(String kind, Double value, Integer restSeconds) {}

    /** One main movement, in plan order. Alternatives replace a movement, so they never reach here. */
    public record Movement(String groupId, List<Effort> sets) {}

    /** Rounded to the nearest minute, floored at 1 so a one-set workout is not reported as taking no time. */
    public static int minutes(List<Movement> movements) {
        double seconds = seconds(movements);
        if (seconds == 0) return 0;
        return (int) Math.max(1, Math.round(seconds / 60));
    }

    /**
     * A circuit's rest is paid once per round: within a group only the last member's rest counts, which is the same
     * rule the builder states under a superset.
     */
    static double seconds(List<Movement> movements) {
        double total = 0;
        for (int i = 0; i < movements.size(); i++) {
            Movement m = movements.get(i);
            String next = i + 1 < movements.size() ? movements.get(i + 1).groupId() : null;
            boolean tailOfChain = m.groupId() == null || next == null || !next.equals(m.groupId());
            total += SETUP_SECONDS;
            for (Effort set : m.sets()) {
                total += work(set);
                if (tailOfChain) total += set.restSeconds() == null ? DEFAULT_REST_SECONDS : set.restSeconds();
            }
        }
        return total;
    }

    /** A kind measured on a clock is already seconds; everything else is a count of reps. MAX kinds carry no number. */
    private static double work(Effort set) {
        if (set.value() == null) return 0;
        return "time".equals(set.kind()) || "max_time".equals(set.kind()) ? set.value() : set.value() * SECONDS_PER_REP;
    }
}
