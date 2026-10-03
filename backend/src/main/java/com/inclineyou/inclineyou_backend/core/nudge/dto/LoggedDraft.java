package com.inclineyou.inclineyou_backend.core.nudge.dto;

/** A nudge_log row found by id, for a replay: who it belongs to, what it said, when it was logged. */
public record LoggedDraft(String trainerId, String clientId, String message, long sentAt) {}
