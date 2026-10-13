package com.inclineyou.inclineyou_backend.core.client.dto;

import com.inclineyou.inclineyou_backend.shared.wire.Patch;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** {@code PATCH /v1/clients/{id}/notes/{noteId}} — {@code body}, {@code pinned}, {@code sharedWithClient}, or any of them. */
public record UpdateNoteRequest(
        Patch<@NotBlank(message = "required") @Size(max = 4000, message = "at most 4,000 characters") String> body,
        /* A cleared pin is an unpinned note. */
        Patch<Boolean> pinned,
        /* A cleared share is a private note. */
        Patch<Boolean> sharedWithClient
) {
    public UpdateNoteRequest {
        if (pinned != null && pinned.value() == null) pinned = Patch.of(false);
        if (sharedWithClient != null && sharedWithClient.value() == null) sharedWithClient = Patch.of(false);
    }

    public boolean isEmpty() {
        return body == null && pinned == null && sharedWithClient == null;
    }
}
