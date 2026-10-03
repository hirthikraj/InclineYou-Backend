package com.inclineyou.inclineyou_backend.core.session.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;

/**
 * One session in the L4 shape (api-contract Today L4): the booking and, once it was started, its log — a session's log
 * IS the {@code scheduled_session} row ({@code started_at} / {@code ended_at}). What a read, a booking and every status
 * verb answers with.
 *
 * @param version opaque — {@code updated_at} as epoch ms; the optional {@code If-Match} on {@code PATCH /v1/sessions/{id}}
 */
public record SessionRow(
        String id,
        String clientId,
        long scheduledAt,
        long endsAt,
        int durationMinutes,
        String status,
        String deliveryMode,
        String notes,
        String slotId,
        SessionWorkout workout,
        Long startedAt,
        Long endedAt,
        SessionLogTotals log,
        SessionCharge charge,
        long updatedAt,
        String version,
        /** scheduled_at at full precision, for the cursor only — never on the wire. */
        @JsonIgnore String cursorKey
) {}
