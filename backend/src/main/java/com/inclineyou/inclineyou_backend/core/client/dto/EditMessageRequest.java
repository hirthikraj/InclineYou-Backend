package com.inclineyou.inclineyou_backend.core.client.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** {@code PATCH /v1/clients/{id}/messages/{messageId}} — the wording, and only while the client has not opened it. */
public record EditMessageRequest(
        @NotBlank(message = "required") @Size(max = 1000, message = "at most 1000 characters") String body
) {
    public EditMessageRequest {
        body = body == null ? null : body.strip();
    }
}
