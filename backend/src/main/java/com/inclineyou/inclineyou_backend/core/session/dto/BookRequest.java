package com.inclineyou.inclineyou_backend.core.session.dto;

/**
 * {@code POST /v1/sessions}.
 *
 * @param id              optional, client-minted, so a retried click books once
 * @param durationMinutes null = the client's {@code session_duration_minutes}
 * @param workoutId       null = the server picks the next workout in the active program
 * @param deliveryMode    null = the client's default; sent only when the trainer changed it
 */
public record BookRequest(String id, String clientId, Long scheduledAt, Integer durationMinutes,
                          String workoutId, String deliveryMode, String notes) {}
