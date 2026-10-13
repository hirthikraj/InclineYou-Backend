package com.inclineyou.inclineyou_backend.core.assessment.dto;

import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;
import java.util.UUID;

/**
 * {@code POST /v1/assessments} — give a client one assessment. {@code dueOn}
 * defaults to today in the workspace's zone, which is what <em>Take now</em>
 * sends. {@code sendNow} (api-contract 1.2, tr-a6) defaults to true: assigned to a
 * client on the portal means visible to them. {@code false} is <em>take in person
 * only</em>; it is ignored for a client who is not on the portal.
 */
public record CreateAssessmentRequest(
        UUID id,
        @NotNull(message = "required") UUID clientId,
        @NotNull(message = "required") UUID templateId,
        LocalDate dueOn,
        Boolean sendNow
) {}
