package com.inclineyou.inclineyou_backend.core.report.dto;

import java.time.Instant;

/** The next scheduled session, and the name of the workout it runs on the plan (null for a walk-in). */
public record NextSession(Instant scheduledAt, Object workoutName) {}
