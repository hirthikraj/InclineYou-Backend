package com.inclineyou.inclineyou_backend.core.sessionlog.dto;

/** Today's diary, not started, not dead. */
public record BookedSession(String sessionId, String clientId, String clientName, long scheduledAt, String workoutName) {}
