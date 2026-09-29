package com.inclineyou.inclineyou_backend.core.client.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import org.hibernate.validator.constraints.Range;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

/**
 * {@code PUT /v1/clients/{id}/schedule} (A8) — the whole week. PUT replaces, so
 * an absent field is a cleared one. Two slots on one weekday and start is the
 * service's refusal: it is a rule across the list.
 */
public record PutScheduleRequest(
        @Range(min = 0, max = 14, message = "a whole number between {min} and {max}") Integer sessionsPerWeek,
        @Range(min = 1, max = 480, message = "a whole number between {min} and {max}") Integer sessionDurationMinutes,
        @Pattern(regexp = "floor|home_visit|remote", message = "floor, home_visit or remote") String deliveryMode,
        @NotNull(message = "a list, required") List<@NotNull(message = "each an object") @Valid Slot> slots,
        /* Where booking starts; null is tomorrow. */
        LocalDate bookFrom
) {
    public record Slot(
            @NotNull(message = "required")
            @Range(min = 1, max = 7, message = "a whole number between {min} and {max}") Integer weekday,
            @NotNull(message = "HH:mm, required") LocalTime start,
            /* The program day this slot books (R45); null = the sequence rule. */
            @Range(min = 1, max = 7, message = "a whole number between {min} and {max}") Integer programDay,
            @Range(min = 1, max = 480, message = "a whole number between {min} and {max}") Integer durationMinutes,
            @Pattern(regexp = "floor|home_visit|remote", message = "floor, home_visit or remote") String deliveryMode
    ) {}
}
