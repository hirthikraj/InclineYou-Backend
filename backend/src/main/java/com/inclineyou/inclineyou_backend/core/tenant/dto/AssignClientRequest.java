package com.inclineyou.inclineyou_backend.core.tenant.dto;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

/**
 * {@code POST /v1/tenants/{id}/clients/{clientId}/assign}. {@code toTrainerId}
 * is a UUID on the record, so a malformed one is a 400 naming the field rather
 * than the 500 {@code UUID.fromString} in the controller used to throw.
 */
public record AssignClientRequest(@NotNull UUID toTrainerId, String note, String reason) {}
