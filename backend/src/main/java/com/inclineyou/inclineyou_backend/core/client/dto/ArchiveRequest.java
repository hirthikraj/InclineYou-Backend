package com.inclineyou.inclineyou_backend.core.client.dto;

import com.inclineyou.inclineyou_backend.shared.util.Text;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** {@code POST /v1/clients/{id}/archive}. {@code reason} is the six client_archive_reason allows. */
public record ArchiveRequest(
        @NotNull(message = REASONS)
        @Pattern(regexp = "goal_reached|moved_away|cost|no_time|switched_trainer|other", message = REASONS) String reason,
        @Size(max = 200, message = "at most 200 characters") String note
) {
    private static final String REASONS = "goal_reached, moved_away, cost, no_time, switched_trainer or other";

    public ArchiveRequest {
        note = Text.orNull(note);
    }
}
