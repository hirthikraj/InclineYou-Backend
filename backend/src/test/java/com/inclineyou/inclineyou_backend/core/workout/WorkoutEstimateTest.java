package com.inclineyou.inclineyou_backend.core.workout;

import com.inclineyou.inclineyou_backend.core.workout.WorkoutEstimate.Effort;
import com.inclineyou.inclineyou_backend.core.workout.WorkoutEstimate.Movement;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * The shelf's duration is a copy of {@code web app/web/lib/workouts/estimate.ts}. Every expected value here was
 * produced by running that file's {@code estimateMinutes} on the same input (19 Oct 2026); a change to either side
 * that moves one of these numbers has to move the other side too.
 */
class WorkoutEstimateTest {

    private static Effort reps(double n, Integer rest) { return new Effort("reps", n, rest); }

    @Test
    @DisplayName("nothing written is 0, and one exercise with no sets is still its setup, floored at a minute")
    void emptyAndSetupOnly() {
        assertEquals(0, WorkoutEstimate.minutes(List.of()));
        assertEquals(1, WorkoutEstimate.minutes(List.of(new Movement(null, List.of()))));   // 45 s
    }

    @Test
    @DisplayName("a rep is 3 s, a rest left blank is 60 s, a timed set is its own seconds, and MAX kinds carry no work")
    void kinds() {
        // 45 + (8×3 + 60) = 129 s → 2
        assertEquals(2, WorkoutEstimate.minutes(List.of(new Movement(null, List.of(reps(8, null))))));
        // 45 + (30 + 15) + (0 + 90) = 180 s → 3
        assertEquals(3, WorkoutEstimate.minutes(List.of(new Movement(null, List.of(
                new Effort("time", 30.0, 15), new Effort("max_reps", null, 90))))));
        // 45 + (40 + 20) = 105 s → 2 (1.75 rounds up)
        assertEquals(2, WorkoutEstimate.minutes(List.of(new Movement(null, List.of(new Effort("max_time", 40.0, 20))))));
    }

    @Test
    @DisplayName("a superset pays its rest once per round: only the last member of a chain counts rest")
    void chainRest() {
        var a = new Movement("g1", List.of(reps(10, 90), reps(10, 90)));
        var b = new Movement("g1", List.of(reps(10, 90), reps(10, 90)));
        var c = new Movement(null, List.of(reps(10, 90)));
        // a: 45 + 60 (no rest, chain continues)   b: 45 + 60 + 180   c: 45 + 30 + 90  = 555 s → 9
        assertEquals(9, WorkoutEstimate.minutes(List.of(a, b, c)));
        // two adjacent chains with different ids are two tails
        var d = new Movement("g2", List.of(reps(10, 90)));
        // a: 45+60+180 (next is g2, a new chain)   d: 45+30+90  = 450 s → 8 (7.5 rounds up)
        assertEquals(8, WorkoutEstimate.minutes(List.of(a, d)));
    }

    @Test
    @DisplayName("fractional effort is kept, and only the total is rounded")
    void rounding() {
        // 45 + (12.5×3 + 0) = 82.5 s → 1
        assertEquals(1, WorkoutEstimate.minutes(List.of(new Movement(null, List.of(reps(12.5, 0))))));
    }
}
