package com.inclineyou.inclineyou_backend.core.report.dto;

/** {@code POST /v1/clients/{id}/report/weekly} — which week, and whether this call stored it (false: it already existed). */
public record WeeklyReportResult(String weekStart, boolean stored) {}
