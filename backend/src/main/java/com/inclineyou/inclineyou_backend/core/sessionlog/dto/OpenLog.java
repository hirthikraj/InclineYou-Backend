package com.inclineyou.inclineyou_backend.core.sessionlog.dto;

import java.math.BigDecimal;

/**
 * A log that was started and not ended, at any age. {@code setsDone} and {@code volumeKg} are the same figures the log
 * read's {@code totals} carries (done sets; done weight × reps in kg), so the picker can say "4 sets in · 1,200 kg"
 * without opening the log.
 */
public record OpenLog(String sessionId, String clientId, String clientName, long scheduledAt, long startedAt,
                      String workoutName, int setsDone, BigDecimal volumeKg) {}
