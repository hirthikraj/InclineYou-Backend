package com.inclineyou.inclineyou_backend.core.report.dto;

import java.util.UUID;

/**
 * A (trainer, client) pair the Monday job reports on. {@code toString} keeps the shape the job's
 * "skipping pair …" warning has always logged, so the log line a person greps for does not change.
 */
public record ActiveClient(UUID trainerId, UUID clientId) {
    @Override
    public String toString() {
        return "{trainer_id=" + trainerId + ", client_id=" + clientId + "}";
    }
}
