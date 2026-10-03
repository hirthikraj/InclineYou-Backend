package com.inclineyou.inclineyou_backend.core.nudge.dto;

import java.util.UUID;

/** One row to append to nudge_log. {@code packageId} / {@code sessionId} only where {@code nudge_log_subject} allows. */
public record NewNudgeLog(UUID id, UUID trainerId, UUID clientId, String reason, String template,
                          UUID packageId, UUID sessionId, String message) {}
