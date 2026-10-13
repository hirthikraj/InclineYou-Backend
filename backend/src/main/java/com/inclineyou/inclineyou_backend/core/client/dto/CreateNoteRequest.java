package com.inclineyou.inclineyou_backend.core.client.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.UUID;

/**
 * {@code POST /v1/clients/{id}/notes}. Free text, a pin, and whether the client
 * may read it (see {@code ClientNoteService}). Private unless {@code sharedWithClient}
 * is true.
 */
public record CreateNoteRequest(
        UUID id,
        @NotBlank(message = "required") @Size(max = 4000, message = "at most 4,000 characters") String body,
        Boolean pinned,
        Boolean sharedWithClient
) {
    public CreateNoteRequest {
        if (pinned == null) pinned = false;
        if (sharedWithClient == null) sharedWithClient = false;
    }
}
