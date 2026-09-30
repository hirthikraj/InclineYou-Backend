package com.inclineyou.inclineyou_backend.core.program.dto;

import com.inclineyou.inclineyou_backend.shared.util.Text;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.hibernate.validator.constraints.Range;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * {@code POST /v1/programs} (A1, A4) and {@code PUT /v1/programs/{id}} (A2) — a
 * program's content: its shape and its whole tree. PUT replaces, so an absent
 * field is a cleared one; POST takes {@code copyFrom} instead of content.
 *
 * <p>Ids are optional at every level. Absent means "mint one"; present means
 * "this row" — and a workout's id is the one that must survive a save, because
 * booked sessions point at it. What depends on another field (a workout's week
 * inside the program's weeks, a bodyweight set with no load) is {@code PlanRules}'
 * refusal; it is a rule across the tree, not across one record.
 */
public record ProgramRequest(
        UUID id,
        /* Required to create from scratch and to save; a copy may leave it out and be named after its source. */
        @Size(max = 150, message = "at most 150 characters") String name,
        @Pattern(regexp = "weight_loss|strength|muscle_gain|rehab|general",
                 message = "weight_loss, strength, muscle_gain, rehab or general") String goal,
        @Size(max = 2000, message = "at most 2000 characters") String description,
        @Range(min = 1, max = 52, message = "a whole number between {min} and {max}") Integer weeks,
        @Range(min = 1, max = 7, message = "a whole number between {min} and {max}") Integer days,
        List<@NotNull(message = "each an object") @Valid WorkoutIn> workouts,
        /* POST only: a template, a client's plan or a library program to copy. Excludes every content field. */
        UUID copyFrom
) {
    public ProgramRequest {
        name = Text.strip(name);
        description = Text.orNull(description);
    }

    public record WorkoutIn(
            UUID id,
            @NotBlank(message = "required") @Size(max = 120, message = "at most 120 characters") String name,
            @Size(max = 2000, message = "at most 2000 characters") String notes,
            @NotNull(message = "required") @Range(min = 1, max = 52, message = "a whole number between {min} and {max}") Integer week,
            @NotNull(message = "required") @Range(min = 1, max = 7, message = "a whole number between {min} and {max}") Integer day,
            @Min(value = 0, message = "0 or more") Integer position,
            List<@NotNull(message = "each an object") @Valid ExerciseIn> exercises
    ) {
        public WorkoutIn {
            name = Text.strip(name);
            notes = Text.orNull(notes);
        }
    }

    public record ExerciseIn(
            UUID id,
            @NotNull(message = "required") UUID exerciseId,
            @Min(value = 0, message = "0 or more") Integer position,
            UUID groupId,
            @Size(max = 60, message = "at most 60 characters") String section,
            @Size(max = 500, message = "at most 500 characters") String notes,
            @Size(max = 30, message = "at most 30 sets") List<@NotNull(message = "each an object") @Valid SetIn> sets,
            @Size(max = 2, message = "at most 2 alternatives") List<@NotNull(message = "each an object") @Valid ExerciseIn> alternatives
    ) {
        public ExerciseIn {
            section = Text.orNull(section);
            notes = Text.orNull(notes);
        }
    }

    public record SetIn(
            UUID id,
            @Min(value = 1, message = "1 or more") Integer position,
            @Pattern(regexp = "percent_1rm|level|weight|weight_range|bodyweight|rpe_level|rpe_weight",
                     message = "percent_1rm, level, weight, weight_range, bodyweight, rpe_level or rpe_weight") String loadKind,
            @DecimalMin(value = "0", message = "0 or more") @DecimalMax(value = "99999.99", message = "at most 99999.99") BigDecimal loadValue,
            @Pattern(regexp = "reps|rep_interval|time|distance|max_reps|max_time|max_distance",
                     message = "reps, rep_interval, time, distance, max_reps, max_time or max_distance") String effortKind,
            @DecimalMin(value = "0", message = "0 or more") @DecimalMax(value = "999999.99", message = "at most 999999.99") BigDecimal effortValue,
            @Range(min = 0, max = 3600, message = "a whole number between {min} and {max}") Integer restSeconds,
            @Size(max = 20, message = "at most 20 characters") String tempo,
            @Size(max = 200, message = "at most 200 characters") String notes
    ) {
        public SetIn {
            tempo = Text.orNull(tempo);
            notes = Text.orNull(notes);
        }
    }
}
