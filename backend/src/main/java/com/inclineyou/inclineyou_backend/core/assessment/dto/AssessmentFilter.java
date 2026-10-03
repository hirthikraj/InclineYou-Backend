package com.inclineyou.inclineyou_backend.core.assessment.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * A validated list filter. Every field but {@code trainerId} and {@code today} may be null/empty.
 *
 * @param today  the workspace's calendar day, which {@code state} is derived against
 * @param states some of booked · missed · done; empty filters nothing
 * @param q      the assessment's or the client's name, case-insensitive
 * @param dueBy  due on or before this date
 */
public record AssessmentFilter(UUID trainerId, LocalDate today, List<String> states, UUID clientId, String q, LocalDate dueBy) {}
