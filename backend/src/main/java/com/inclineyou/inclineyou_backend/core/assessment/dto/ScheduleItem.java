package com.inclineyou.inclineyou_backend.core.assessment.dto;

/** A cycle on the wire (contract Assessments L5). */
public record ScheduleItem(
        String id,
        String clientId,
        String templateId,
        String templateName,
        int intervalDays,
        String nextDueOn,
        Long endedAt,
        /* The one not yet completed (uq_assessment_schedule_open) — what Take opens. */
        String openAssessmentId,
        long createdAt,
        long updatedAt,
        String version,
        /* The cycle sends the assessment it books on its due date (V12). */
        boolean sendToClient
) {}
