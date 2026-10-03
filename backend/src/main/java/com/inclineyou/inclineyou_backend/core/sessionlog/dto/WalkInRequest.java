package com.inclineyou.inclineyou_backend.core.sessionlog.dto;

/** Book now and start, in one write; scheduled_at is the server's clock and is never sent. */
public record WalkInRequest(String id, String clientId, Integer durationMinutes, String workoutId) {}
