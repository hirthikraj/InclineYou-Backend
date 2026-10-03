package com.inclineyou.inclineyou_backend.core.session.dto;

import java.time.Instant;
import java.util.UUID;

/** One booking to insert. {@code workoutId} and {@code deliveryMode} may be null; {@code ends_at} and the tenant are the database's. */
public record NewSession(UUID id, UUID trainerId, UUID clientId, Instant scheduledAt, int durationMinutes,
                         UUID workoutId, String deliveryMode, String notes) {}
