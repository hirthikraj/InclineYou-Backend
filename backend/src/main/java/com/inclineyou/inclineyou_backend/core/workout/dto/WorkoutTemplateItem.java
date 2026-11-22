package com.inclineyou.inclineyou_backend.core.workout.dto;

import com.inclineyou.inclineyou_backend.core.program.dto.PlanWorkout.Exercise;

import java.util.List;

/**
 * A standalone workout on the 1.1 wire (Programs L4): one session's plan that
 * belongs to no program. {@code exerciseCount} and {@code setCount} are counted
 * on read, never stored; alternatives replace a movement and so are not counted.
 */
public record WorkoutTemplateItem(
        String id, String name, String notes, List<Exercise> exercises, List<Divider> dividers,
        int exerciseCount, int setCount, long createdAt, long updatedAt, String version,
        /*
         * Every exercise it uses, by id, a retired one included — the program tree's dictionary (19 Nov 2026). The web
         * fetched each exercise on its own to name the rows, one request per exercise, and a retired custom came back 404
         * with no name. Additive; absent on the shelf's summaries.
         */
        @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
        java.util.Map<String, com.inclineyou.inclineyou_backend.core.program.dto.ExerciseRef> names
) {
    public record Divider(int position, String label) {}
}
