package com.inclineyou.inclineyou_backend.core.report.dto;

import java.time.Instant;

/** The next scheduled session, and the label its day carries on the plan (null when it has none). */
public record NextSession(Instant scheduledAt, Object dayLabel) {}
