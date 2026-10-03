package com.inclineyou.inclineyou_backend.core.session.dto;

import com.inclineyou.inclineyou_backend.shared.wire.Patch;

import java.time.Instant;

/**
 * What a PATCH changes, validated: a field is null when the key was absent and a {@link Patch} when it was sent, whose
 * value is null when it was sent as null (only {@code deliveryMode} and {@code notes} can be cleared).
 */
public record SessionEdit(Patch<Instant> scheduledAt, Patch<Integer> durationMinutes,
                          Patch<String> deliveryMode, Patch<String> notes) {

    /** Time, length and mode are what a session was charged and logged as; only the note may change after. */
    public boolean reshapes() {
        return scheduledAt != null || durationMinutes != null || deliveryMode != null;
    }
}
