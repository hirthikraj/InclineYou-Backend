package com.inclineyou.inclineyou_backend.core.tenant.dto;

import java.math.BigDecimal;
import java.time.Instant;

/** A client with no working coach — {@code GET /v1/tenants/{id}/stale-clients}. */
public record StaleClient(
        String clientId, String name, String phone,
        String previousTrainerId, String previousTrainerName,
        String staleReason, Instant staleAt,
        BigDecimal outstanding
) {}
