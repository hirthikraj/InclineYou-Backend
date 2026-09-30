package com.inclineyou.inclineyou_backend.core.assessment.dto;

/**
 * The list item (contract Assessments L1), which is also what create, move and a
 * cycle's next booking return.
 *
 * @param state   booked · missed · done — derived from {@code completed_at} and
 *                {@code due_on}, never stored
 * @param version opaque; {@code updated_at} as epoch ms, sent back as If-Match
 */
public record AssessmentItem(
        String id,
        String clientId,
        String templateId,
        String scheduleId,
        String name,
        String dueOn,
        String state,
        Long completedAt,
        String enteredBy,
        Count measurements,
        Count questions,
        long createdAt,
        String version
) {}
