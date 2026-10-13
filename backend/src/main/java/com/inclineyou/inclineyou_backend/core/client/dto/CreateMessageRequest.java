package com.inclineyou.inclineyou_backend.core.client.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.UUID;

/**
 * {@code POST /v1/clients/{id}/messages}. Plain text in the trainer's voice; there is no reply and nothing is sent to WhatsApp.
 *
 * <p>{@code kind} is not the caller's to say for a recap: a {@code sessionId} makes one, so {@code kind} is only ever
 * {@code note} (the default) or {@code weekly}, and sending it beside a {@code sessionId} is refused in the service.
 */
public record CreateMessageRequest(
        UUID id,
        @NotBlank(message = "required") @Size(max = 1000, message = "at most 1000 characters") String body,
        UUID sessionId,
        @Pattern(regexp = "note|weekly", message = "note or weekly") String kind
) {
    public CreateMessageRequest {
        body = body == null ? null : body.strip();
    }
}
