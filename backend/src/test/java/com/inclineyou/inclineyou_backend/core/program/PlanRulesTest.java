package com.inclineyou.inclineyou_backend.core.program;

import com.inclineyou.inclineyou_backend.core.program.dto.ProgramRequest.ExerciseIn;
import com.inclineyou.inclineyou_backend.core.program.dto.ProgramRequest.SetIn;
import com.inclineyou.inclineyou_backend.core.program.dto.ProgramRequest.WorkoutIn;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** The rules that span fields (Programs A1) — the per-field shapes are Bean Validation on the request. */
class PlanRulesTest {

    private static SetIn set(String loadKind, BigDecimal load, String effortKind, BigDecimal effort) {
        return new SetIn(null, null, loadKind, load, effortKind, effort, null, null, null);
    }

    private static ExerciseIn exercise(List<SetIn> sets, List<ExerciseIn> alternatives) {
        return new ExerciseIn(null, UUID.randomUUID(), null, null, null, null, sets, alternatives);
    }

    private static WorkoutIn workout(UUID id, int week, int day, Integer position, List<ExerciseIn> exercises) {
        return new WorkoutIn(id, "W", null, week, day, position, exercises);
    }

    @Test
    void positionsAreRederivedPerDayAndIdsSurvive() {
        UUID keep = UUID.randomUUID();
        var tree = PlanRules.tree(List.of(
                workout(null, 1, 1, 7, List.of()),
                workout(keep, 1, 1, 2, List.of()),
                workout(null, 1, 2, null, List.of())), 4, 3);
        assertEquals(List.of(0, 1, 0), tree.stream().map(PlanRules.W::position).toList());
        assertEquals(keep, tree.get(0).id());
    }

    @Test
    void mintsIdsForRowsThatHaveNone() {
        var tree = PlanRules.tree(List.of(workout(null, 1, 1, null,
                List.of(exercise(List.of(set("weight", null, "reps", BigDecimal.TEN)), List.of())))), 1, 1);
        assertTrue(tree.get(0).id() != null && tree.get(0).exercises().get(0).sets().get(0).id() != null);
    }

    @Test
    void aWorkoutMustFitTheProgram() {
        assertThrows(ApiException.class, () -> PlanRules.tree(List.of(workout(null, 5, 1, null, List.of())), 4, 3));
        assertThrows(ApiException.class, () -> PlanRules.tree(List.of(workout(null, 1, 4, null, List.of())), 4, 3));
    }

    @Test
    void bodyweightHasNoLoadAndMaxHasNoEffortValue() {
        var bodyweight = set("bodyweight", BigDecimal.TEN, "reps", BigDecimal.TEN);
        var max = set("weight", null, "max_reps", BigDecimal.TEN);
        for (SetIn bad : List.of(bodyweight, max)) {
            assertThrows(ApiException.class, () -> PlanRules.tree(
                    List.of(workout(null, 1, 1, null, List.of(exercise(List.of(bad), List.of())))), 1, 1));
        }
    }

    @Test
    void anIdMayNotAppearTwice() {
        UUID id = UUID.randomUUID();
        assertThrows(ApiException.class, () -> PlanRules.tree(
                List.of(workout(id, 1, 1, null, List.of()), workout(id, 1, 2, null, List.of())), 1, 2));
    }

    @Test
    void anAlternativeHasNoAlternativesOfItsOwn() {
        var inner = exercise(List.of(), List.of());
        var alt = exercise(List.of(), List.of(inner));
        assertThrows(ApiException.class, () -> PlanRules.tree(
                List.of(workout(null, 1, 1, null, List.of(exercise(List.of(), List.of(alt))))), 1, 1));
    }
}
