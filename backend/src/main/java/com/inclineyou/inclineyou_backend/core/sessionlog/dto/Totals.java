package com.inclineyou.inclineyou_backend.core.sessionlog.dto;

import java.math.BigDecimal;

/** The session's running figures, one aggregate over its live (not removed) exercises. volumeKg counts done weight × reps sets alone, a JSON number. */
public record Totals(int setsDone, int setsPlanned, BigDecimal volumeKg) {}
