package com.inclineyou.inclineyou_backend.core.client.dto;

import java.util.List;

/**
 * The L3 row (api-contract Today L3, reused by Clients): what the roster reads
 * and what every Clients write answers with.
 */
public record ClientSummary(
        String id,
        String name,
        String phone,
        String status,
        /** Epoch ms; set while paused. */
        Long pausedAt,
        String pausedUntil,
        /** Epoch ms and the reason, set while archived — the Archived list reads them. */
        Long archivedAt,
        String archiveReason,
        String archiveNote,
        String membershipStatus,
        String clientType,
        boolean hasPinnedNote,
        Schedule schedule,
        List<Slot> slots,
        Program program,
        Stats stats,
        long createdAt,
        /** {@code client.updated_at} as epoch ms — If-Match for {@code PATCH /v1/clients/{id}}. */
        String version
) {
    /**
     * @param version opaque — {@code client_schedule.updated_at} as epoch ms, the
     *                {@code If-Match} value for {@code PUT /v1/clients/{id}/schedule}
     */
    public record Schedule(Integer sessionsPerWeek, Integer sessionDurationMinutes, String deliveryMode,
                           String version) {}

    /** @param programDay the program day this slot books (V2, R45); null = the sequence rule */
    public record Slot(String id, int weekday, String start, Integer programDay, Integer durationMinutes,
                       String deliveryMode) {}

    public record Program(String id, String name, int weeks, int days, String startDate, String endDate) {}

    /**
     * @param lastDoneAt    epoch ms of the newest delivered session, null if none
     * @param nextSessionAt epoch ms of the soonest booked session still to come
     * @param missedStreak  consecutive no-shows among the newest settled sessions
     */
    public record Stats(int sessionsDone, Long lastDoneAt, Long nextSessionAt, int missedStreak) {}
}
