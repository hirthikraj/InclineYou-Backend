package com.inclineyou.inclineyou_backend.core.session.dto;

import java.math.BigDecimal;

/** Only when the log was opened. {@code volumeKg} counts weight x reps sets alone — a number since 1.1. */
public record SessionLogTotals(int exercises, int setsDone, BigDecimal volumeKg, Long lastSetAt) {}
