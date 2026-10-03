package com.inclineyou.inclineyou_backend.core.report.dto;

/** Sessions in one Monday-to-Sunday week: kept, and planned (not cancelled). Counts are passed through as the driver gives them. */
public record WeekSessions(Object kept, Object planned) {}
