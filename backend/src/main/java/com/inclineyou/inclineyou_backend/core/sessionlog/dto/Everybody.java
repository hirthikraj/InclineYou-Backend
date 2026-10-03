package com.inclineyou.inclineyou_backend.core.sessionlog.dto;

/** An active client who can be logged with no booking. */
public record Everybody(String clientId, String clientName, String nextWorkoutName, Long lastDoneAt) {}
