package com.inclineyou.inclineyou_backend.core.client.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * {@code GET /v1/clients?view=legacy} — the pre-v1 roster row, a bare array.
 * Its shape is kept on purpose while the screens still reading it move to the
 * summary; fields whose columns v1 dropped are always null rather than removed.
 */
public record ClientResponse(
        UUID id,
        UUID trainerId,
        String name,
        String phone,
        String goal,
        String status,
        /** Always null in v1 — the split is set per package (R3). */
        String paymentMode,
        /** Always null in v1 — see {@code paymentMode}. */
        BigDecimal trainerSplitPercent,
        BigDecimal heightCm,
        String activityLevel,
        Map<String, Object> metadata,
        /* The rhythm — `client_schedule` in v1. */
        Integer sessionsPerWeek,
        Integer sessionDurationMinutes,
        /**
         * `client_schedule_slot`, as `[{templateDay, weekday, time}]`. v1 stores
         * no program day on a slot (R45 is pending), so `templateDay` is the
         * slot's ordinal in the week.
         */
        List<Map<String, Object>> weeklySchedule,
        String deliveryMode,
        StatusFlags statusFlags,
        long createdAt,
        long updatedAt,
        String membershipStatus,
        /** What a write booked in the diary. Always null until the schedule write moves to v1. */
        Integer sessionsBooked,
        Long firstSessionAt,
        /* The measuring cycle moved to `assessment_schedule` — always null here. */
        Integer assessmentIntervalDays,
        String nextAssessmentOn,
        List<String> assessmentMetrics,
        String dateOfBirth
) {
    public record StatusFlags(boolean paymentDue, boolean sessionPackLow, boolean planExpiring) {}
}
