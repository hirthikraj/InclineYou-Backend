package com.inclineyou.inclineyou_backend.core.assessment.dto;

import com.inclineyou.inclineyou_backend.shared.wire.Patch;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

/**
 * {@code PATCH /v1/assessment-schedules/{id}} — the date, the pace, whether the cycle sends to the client, or any of them.
 * Ending is its own verb ({@code POST …/end}), so the draft's {@code end} key is
 * refused as unknown. None of the fields can be cleared.
 */
public record UpdateScheduleRequest(
        Patch<@NotNull(message = "cannot be cleared") LocalDate> nextDueOn,
        Patch<@NotNull(message = "cannot be cleared") @Min(value = 1, message = "between 1 and 366") @Max(value = 366, message = "between 1 and 366") Integer> intervalDays,
        Patch<@NotNull(message = "cannot be cleared") Boolean> sendToClient
) {
    public boolean isEmpty() {
        return nextDueOn == null && intervalDays == null && sendToClient == null;
    }
}
