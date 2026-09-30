package com.inclineyou.inclineyou_backend.core.exercise.dto;

import com.inclineyou.inclineyou_backend.shared.util.Text;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

/**
 * {@code POST /v1/exercises} (Programs A9) — a custom exercise, visible only in
 * this workspace. {@code logType} only chooses the default kinds when it is
 * added mid-session; a null one is {@code weight_reps}.
 */
public record ExerciseRequest(
        UUID id,
        @NotBlank(message = "required") @Size(max = 150, message = "at most 150 characters") String name,
        @Size(max = 30, message = "at most 30 characters") String bodyPart,
        @Size(max = 50, message = "at most 50 characters") String target,
        @Size(max = 50, message = "at most 50 characters") String equipment,
        @Pattern(regexp = "weight_reps|reps", message = "weight_reps or reps") String logType,
        @Size(max = 20, message = "at most 20 characters") String level,
        @Size(max = 4000, message = "at most 4000 characters") String description,
        @Size(max = 10, message = "at most 10 cues") List<@NotBlank(message = "not blank") @Size(max = 200, message = "at most 200 characters") String> formCues,
        @Pattern(regexp = "published|draft", message = "published or draft") String status
) {
    public ExerciseRequest {
        name = Text.strip(name);
        bodyPart = Text.orNull(bodyPart);
        target = Text.orNull(target);
        equipment = Text.orNull(equipment);
        level = Text.orNull(level);
        description = Text.orNull(description);
    }
}
