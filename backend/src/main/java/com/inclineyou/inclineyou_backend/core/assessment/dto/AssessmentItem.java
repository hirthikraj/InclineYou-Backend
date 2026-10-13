package com.inclineyou.inclineyou_backend.core.assessment.dto;

/**
 * The list item (contract Assessments L1), which is also what create, move and a
 * cycle's next booking return.
 *
 * @param state   booked · missed · done — derived from {@code completed_at} and
 *                {@code due_on}, never stored
 * @param version opaque; {@code updated_at} as epoch ms, sent back as If-Match
 * @param sentAt  epoch ms it was sent to the client, or null while it is the trainer's alone (api-contract 1.2, tr-a6)
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
        String version,
        /* When it was sent to the client, or null: the one thing that makes it visible to them (V12). */
        Long sentAt
) {}
