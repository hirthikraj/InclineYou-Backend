package com.inclineyou.inclineyou_backend.core.assessment.dto;

import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

/** {@code PATCH /v1/assessments/{id}} — the date is the one thing that moves. */
public record MoveAssessmentRequest(@NotNull(message = "required") LocalDate dueOn) {}
