package com.inclineyou.inclineyou_backend.core.exercise.dto;

import com.inclineyou.inclineyou_backend.core.exercise.LogTypes;
import com.inclineyou.inclineyou_backend.shared.util.Text;
import com.inclineyou.inclineyou_backend.shared.wire.Patch;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * {@code PATCH /v1/exercises/{id}} (Programs A10) — any subset of the create
 * fields, on the trainer's own exercises. A component left null was not sent; a
 * {@link Patch} holding null clears it. The name, the log type and the status
 * can be changed but not cleared.
 */
public record PatchExerciseRequest(
        Patch<@NotBlank(message = "required") @Size(max = 150, message = "at most 150 characters") String> name,
        Patch<@Size(max = 30, message = "at most 30 characters") String> bodyPart,
        Patch<@Size(max = 50, message = "at most 50 characters") String> target,
        Patch<@Size(max = 50, message = "at most 50 characters") String> equipment,
        Patch<@NotNull(message = LogTypes.MESSAGE) @Pattern(regexp = LogTypes.REGEX, message = LogTypes.MESSAGE) String> logType,
        Patch<@Size(max = 20, message = "at most 20 characters") String> level,
        Patch<@Size(max = 4000, message = "at most 4000 characters") String> description,
        Patch<@NotNull(message = "a list") @Size(max = 10, message = "at most 10 cues") List<@NotBlank(message = "not blank") @Size(max = 200, message = "at most 200 characters") String>> formCues,
        Patch<@NotNull(message = "published or draft") @Pattern(regexp = "published|draft", message = "published or draft") String> status
) {
    public PatchExerciseRequest {
        name = Patch.map(name, String::strip);
        bodyPart = Patch.map(bodyPart, Text::orNull);
        target = Patch.map(target, Text::orNull);
        equipment = Patch.map(equipment, Text::orNull);
        level = Patch.map(level, Text::orNull);
        description = Patch.map(description, Text::orNull);
    }

    public boolean isEmpty() {
        return name == null && bodyPart == null && target == null && equipment == null && logType == null
                && level == null && description == null && formCues == null && status == null;
    }
}
