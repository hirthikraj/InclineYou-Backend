package com.inclineyou.inclineyou_backend.core.client.dto;

import com.inclineyou.inclineyou_backend.shared.util.Text;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** {@code POST /v1/clients/{id}/archive}. {@code reason} is one client_archive_reason allows (V48 added not_interested and no_response, the two a prospect ends on). */
public record ArchiveRequest(
        @NotNull(message = REASONS)
        @Pattern(regexp = "goal_reached|moved_away|cost|no_time|switched_trainer|other|not_interested|no_response", message = REASONS) String reason,
        @Size(max = 200, message = "at most 200 characters") String note
) {
    private static final String REASONS = "goal_reached, moved_away, cost, no_time, switched_trainer, other, not_interested or no_response";

    public ArchiveRequest {
        note = Text.orNull(note);
    }
}
