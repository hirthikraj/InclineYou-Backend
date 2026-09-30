package com.inclineyou.inclineyou_backend.core.client.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * {@code POST /v1/clients/{id}/delete}. {@code confirmName} must match the
 * client's own name — case- and whitespace-insensitively, checked server-side
 * in {@code ClientStateService.delete}, the same "type it back" shape closing
 * the trainer's own account uses ({@code DeleteAccountRequest}).
 */
public record DeleteClientRequest(@NotBlank String confirmName) {}
