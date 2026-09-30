package com.inclineyou.inclineyou_backend.core.workout.dto;

import com.inclineyou.inclineyou_backend.core.program.dto.ProgramRequest.ExerciseIn;
import com.inclineyou.inclineyou_backend.shared.util.Text;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

/**
 * {@code POST /v1/workout-templates} and {@code PUT /v1/workout-templates/{id}}
 * (Programs A7) — the whole workout on each save. The exercises are a program
 * workout's own {@link ExerciseIn}, so a set means the same thing in both; what
 * a standalone workout adds is {@code dividers}, labelled breaks stored as the
 * {@code section} of the exercise they sit in front of.
 *
 * <p>{@code id} is the workout's and only matters on POST, for a safe retry.
 * Below the workout nothing keeps an id across a save: any an exercise or set
 * carries is ignored and the server re-derives ids and ordinals.
 */
public record WorkoutTemplateRequest(
        UUID id,
        @NotBlank(message = "required") @Size(max = 120, message = "at most 120 characters") String name,
        @Size(max = 2000, message = "at most 2000 characters") String notes,
        @NotNull(message = "a list, required; an empty one clears the workout")
        @Size(max = 60, message = "at most 60 exercises")
        List<@NotNull(message = "each an object") @Valid ExerciseIn> exercises,
        @Size(max = 30, message = "at most 30 dividers")
        List<@NotNull(message = "each an object") @Valid Divider> dividers
) {
    public WorkoutTemplateRequest {
        name = Text.strip(name);
        notes = Text.orNull(notes);
    }

    /** A labelled break in front of the exercise at {@code position}. */
    public record Divider(
            @NotNull(message = "required") @Min(value = 0, message = "0 or more") Integer position,
            @NotBlank(message = "required") @Size(max = 60, message = "at most 60 characters") String label
    ) {
        public Divider {
            label = Text.strip(label);
        }
    }
}
