package com.inclineyou.inclineyou_backend.core.sessionlog.dto;

import java.math.BigDecimal;

/** What the plan prescribed for a set, copied onto the row when the log opened. */
public record SetTarget(BigDecimal load, BigDecimal effort, Integer restSeconds, String tempo) {}
