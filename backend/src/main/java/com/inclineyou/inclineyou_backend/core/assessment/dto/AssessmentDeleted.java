package com.inclineyou.inclineyou_backend.core.assessment.dto;

/** {@code next}: what the cycle booked in the deleted one's place, null for a one-off. */
public record AssessmentDeleted(AssessmentItem next) {}
