package com.inclineyou.inclineyou_backend.core.tenant.dto;

/** {@code POST /v1/tenants/{id}/members/{trainerId}/unavailable}. A null reason is {@code trainer_unavailable}. */
public record MarkUnavailableRequest(String reason) {}
