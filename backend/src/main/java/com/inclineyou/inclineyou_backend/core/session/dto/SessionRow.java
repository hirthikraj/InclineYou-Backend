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
        /** {@code trainer} (a booking, in the diary) or {@code client} (a workout they did alone; only in that client's own history). */
        String loggedBy,
        SessionWorkout workout,
        Long startedAt,
        Long endedAt,
        SessionLogTotals log,
        SessionCharge charge,
        /**
         * How the session is paid for (V32): {@code pack} (Mark done charges the live pack) · {@code trial} ·
         * {@code complimentary} (never charged) · {@code single} (Mark done sells it on its own at {@code price}).
         */
        String billing,
        /** A single session's price, a decimal string; null for every other billing. */
        String price,
        /** A single session's own sale, made at booking (10 Nov 2026); null for every other billing. */
        SessionSale sale,
        /** How the client said the workout felt, or null (api-contract 1.2). */
        SessionFeedback feedback,
        /** The trainer's recap line for this session, or null; {@code readAt} says whether the client opened it. */
        SessionRecap recapMessage,
        long updatedAt,
        String version,
        /** scheduled_at at full precision, for the cursor only — never on the wire. */
        @JsonIgnore String cursorKey
) {}
