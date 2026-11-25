package com.inclineyou.inclineyou_backend.core.join.dto;

import java.util.List;
import java.util.UUID;

/**
 * One row of Join requests. A waiting or declined request carries the person as they gave it; an approved one carries only
 * its client, because approval moved the person to the client row (V45).
 */
public record JoinRequestItem(
        UUID id,
        String status,
        String name,
        String phone,
        String email,
        String dateOfBirth,
        String gender,
        Plan plan,
        List<Answer> answers,
        boolean whatsappReminders,
        long createdAt,
        Long decidedAt,
        UUID clientId
) {
    /** The pack they picked, as it is now; {@code null} when they picked none (or it has since been deleted). */
    public record Plan(UUID id, String name, String amount, String currency, boolean offered) {}

    public record Answer(String label, String answer) {}
}
