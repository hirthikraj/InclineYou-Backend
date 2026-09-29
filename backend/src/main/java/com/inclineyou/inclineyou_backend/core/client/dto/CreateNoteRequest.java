package com.inclineyou.inclineyou_backend.core.client.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Null;
import jakarta.validation.constraints.Size;

import java.util.UUID;

/**
 * {@code POST /v1/clients/{id}/notes}. Free text and a pin, and that is the
 * whole shape (see {@code ClientNoteService}). {@code sharedWithClient} is
 * accepted only to be refused by name.
 */
public record CreateNoteRequest(
        UUID id,
        @NotBlank(message = "required") @Size(max = 4000, message = "at most 4,000 characters") String body,
        Boolean pinned,
        @Null(message = "notes shared with the client are not in v1") Object sharedWithClient
) {
    public CreateNoteRequest {
        if (pinned == null) pinned = false;
    }
}
