package com.inclineyou.inclineyou_backend.core.session.dto;

import java.time.Instant;

/**
 * A single session's own sale as the verbs need it (10 Nov 2026): the live one (not deleted, not refunded).
 *
 * @param status       {@code active} · {@code completed} · {@code cancelled} · {@code expired}
 * @param hasMoney     any payment row on it (paid, written off or refunded) — money that moved is history
 * @param bookedWithIt sold in the same step as the booking (the session's {@code created_at}), so Undo may take both
 */
public record SingleSale(String id, String status, int sessionsRemaining, boolean paused, boolean hasMoney,
                         Instant createdAt, boolean bookedWithIt) {}
