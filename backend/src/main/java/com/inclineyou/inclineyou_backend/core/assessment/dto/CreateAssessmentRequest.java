package com.inclineyou.inclineyou_backend.core.assessment.dto;

import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;
import java.util.UUID;

/**
 * {@code POST /v1/assessments} — give a client one assessment. {@code dueOn}
 * defaults to today in the workspace's zone, which is what <em>Take now</em>
 * sends. Sending to the client ({@code sendNow}) is out of v1, so it is an
 * unknown key and strict binding refuses it by name.
 */
public record CreateAssessmentRequest(
        UUID id,
        @NotNull(message = "required") UUID clientId,
        @NotNull(message = "required") UUID templateId,
        LocalDate dueOn
) {}
