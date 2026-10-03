package com.inclineyou.inclineyou_backend.core.report.dto;

import java.time.LocalDate;
import java.util.UUID;

/** Everything one stored weekly report holds. {@code bestLine} and {@code bestPrevious} are null in a week with no record. */
public record WeeklyReportRow(
        UUID trainerId, UUID clientId, LocalDate weekStart, LocalDate weekEnd,
        Object kept, Object planned, String trainedDays, Object volume, Object sets,
        int newBests, Object bestLine, Object bestPrevious) {}
