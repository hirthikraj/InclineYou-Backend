package com.inclineyou.inclineyou_backend.core.assessment.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;
import java.util.UUID;

/** {@code POST /v1/assessment-schedules} — {@code firstDueOn} defaults to today in the workspace's zone. */
public record CreateScheduleRequest(
        UUID id,
        @NotNull(message = "required") UUID clientId,
        @NotNull(message = "required") UUID templateId,
        @NotNull(message = "required") @Min(value = 1, message = "between 1 and 366") @Max(value = 366, message = "between 1 and 366") Integer intervalDays,
        LocalDate firstDueOn
) {}
