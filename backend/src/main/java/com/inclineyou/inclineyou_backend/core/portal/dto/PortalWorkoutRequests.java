package com.inclineyou.inclineyou_backend.core.portal.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** The request bodies of the client's workout routes. Strict binding refuses any other key before a service sees it. */
public final class PortalWorkoutRequests {

    private PortalWorkoutRequests() {}

    /** {@code POST /v1/portal/sessions}: the id is minted by the browser, like every create. */
    public record Start(@NotBlank(message = "required") String id, @NotBlank(message = "required") String workoutId) {}

    /** {@code PATCH /v1/portal/sessions/{id}}: the cumulative pause clock, nothing else. */
    public record Pause(@Min(value = 0, message = "not negative") @Max(value = 43200, message = "at most 12 hours") Integer pausedSeconds) {}

    public record Swap(@NotBlank(message = "required") String toExerciseId,
                       @Pattern(regexp = "approved|library", message = "approved or library") String source,
                       @Pattern(regexp = "busy|pain|other", message = "busy, pain or other") String reason) {}

    /** {@code POST …/finish}: every field optional. */
    public record Finish(@Pattern(regexp = "easy|right|hard", message = "easy, right or hard") String effort,
                         @Size(max = 1000, message = "at most 1,000 characters") String note,
                         @Min(value = 0, message = "not negative") @Max(value = 43200, message = "at most 12 hours") Integer pausedSeconds) {}

    /** {@code PUT …/feedback}: replaces both answers, so a null clears. */
    public record Feedback(@Pattern(regexp = "easy|right|hard", message = "easy, right or hard") String effort,
                           @Size(max = 1000, message = "at most 1,000 characters") String note) {}
}
