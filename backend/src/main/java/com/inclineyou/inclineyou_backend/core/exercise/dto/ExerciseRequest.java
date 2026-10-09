package com.inclineyou.inclineyou_backend.core.exercise.dto;

import com.inclineyou.inclineyou_backend.core.exercise.LogTypes;
import com.inclineyou.inclineyou_backend.shared.util.Text;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

/**
 * {@code POST /v1/exercises} (Programs A9) — a custom exercise, visible only in
 * this workspace. {@code logType} only chooses the default kinds when it is
 * added mid-session; a null one is {@code weight_reps}. Six values since V9 — see {@link LogTypes}.
 */
public record ExerciseRequest(
        UUID id,
        @NotBlank(message = "required") @Size(max = 150, message = "at most 150 characters") String name,
        @Size(max = 30, message = "at most 30 characters") String bodyPart,
        @Size(max = 50, message = "at most 50 characters") String target,
        @Size(max = 50, message = "at most 50 characters") String equipment,
        @Pattern(regexp = LogTypes.REGEX, message = LogTypes.MESSAGE) String logType,
        @Size(max = 20, message = "at most 20 characters") String level,
        @Size(max = 4000, message = "at most 4000 characters") String description,
        @Size(max = 10, message = "at most 10 cues") List<@NotBlank(message = "not blank") @Size(max = 200, message = "at most 200 characters") String> formCues,
        @Pattern(regexp = "published|draft", message = "published or draft") String status,
        /* What the library knows about a movement and the create form now asks for. Optional, all of it. */
        @Size(max = 50, message = "at most 50 characters") String movementPattern,
        @Size(max = 10, message = "at most 10 muscles") List<@NotBlank(message = "not blank") @Size(max = 50, message = "at most 50 characters") String> secondaryTargets,
        @Size(max = 10, message = "at most 10 names") List<@NotBlank(message = "not blank") @Size(max = 80, message = "at most 80 characters") String> aliases,
        @Size(max = 10, message = "at most 10 mistakes") List<@NotBlank(message = "not blank") @Size(max = 200, message = "at most 200 characters") String> commonMistakes,
        @Size(max = 10, message = "at most 10 notes") List<@NotBlank(message = "not blank") @Size(max = 200, message = "at most 200 characters") String> safety,
        @Size(max = 10, message = "at most 10 items") List<@NotBlank(message = "not blank") @Size(max = 80, message = "at most 80 characters") String> equipmentNeeded
) {
    public ExerciseRequest {
        name = Text.strip(name);
        bodyPart = Text.orNull(bodyPart);
        target = Text.orNull(target);
        equipment = Text.orNull(equipment);
        level = Text.orNull(level);
        description = Text.orNull(description);
        movementPattern = Text.orNull(movementPattern);
        /* muscles are stored lower-case, as the library writes them, so a filter on one finds a custom exercise too */
        secondaryTargets = secondaryTargets == null ? null : secondaryTargets.stream().map(v -> v.strip().toLowerCase()).distinct().toList();
    }
}
