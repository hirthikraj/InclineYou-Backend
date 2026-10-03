package com.inclineyou.inclineyou_backend.core.assessment;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * An {@code assessment} row as the services read it: the jsonb columns still
 * text, because most callers need only one of them.
 *
 * @param deleted set only on a row read through {@code lock}, which sees deleted
 *                rows too so a second DELETE can answer as the first did
 */
record AssessmentRow(UUID id, UUID clientId, UUID templateId, UUID scheduleId, String name, LocalDate dueOn,
                     Instant completedAt, String enteredBy, String form, String readings, String answers,
                     Instant createdAt, Instant updatedAt, boolean deleted) {

    /** The If-Match value: {@code updated_at} as epoch ms. */
    String version() {
        return String.valueOf(updatedAt.toEpochMilli());
    }

    boolean done() {
        return completedAt != null;
    }

}
