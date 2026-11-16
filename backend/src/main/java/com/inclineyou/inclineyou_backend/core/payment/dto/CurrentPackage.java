package com.inclineyou.inclineyou_backend.core.payment.dto;

public record CurrentPackage(
        String id,
        String clientId,
        String packId,
        String name,
        String service,
        String basis,
        Integer sessionsTotal,
        Integer sessionsRemaining,
        String amount,
        String discountAmount,
        String currency,
        String startDate,
        String endDate,
        String dueDate,
        String status,
        Long pausedAt,
        int pausedDays,
        String trainerSharePercent,
        String trainerShareAmount,
        String amountPaid,
        /** Σ refund rows — 1.1. */
        String amountRefunded,
        String amountDue,
        /** Epoch ms; set once the pack stopped being live (package_closed). */
        Long closedAt,
        long createdAt,
        /** {@code package.updated_at} as epoch ms. A payment write touches it too, so it moves with amountDue. */
        String version,
        /**
         * V32, on {@code scope=current} only (null elsewhere): this CLIENT's sessions still to be marked for this
         * service and billed to a pack — every pack of that client and service carries the same count, because Mark
         * done picks the pack, not the booking. The booking panel subtracts it from what the live packs have left to
         * say whether one more booking is covered. Counts trainer bookings still {@code scheduled} from 30 days back
         * (the window Today closes out), none of them trial, complimentary or single.
         */
        Integer sessionsBookedAhead,
        /**
         * V32 (9 Nov 2026): set on the one-session package a {@code single}-billed session sold at Mark done — the id
         * of that session — and null on every real pack. A single sale is money owed for one session, never a pack:
         * it raises no "pack ending / empty", offers no Renew ({@code 422 PACKAGE_SINGLE_SESSION}), and is not the
         * "newest pack" that {@code scope=current} keeps for Renew's terms.
         */
        String sessionId
) {
    public CurrentPackage withBookedAhead(Integer n) {
        return new CurrentPackage(id, clientId, packId, name, service, basis, sessionsTotal, sessionsRemaining, amount,
                discountAmount, currency, startDate, endDate, dueDate, status, pausedAt, pausedDays, trainerSharePercent,
                trainerShareAmount, amountPaid, amountRefunded, amountDue, closedAt, createdAt, version, n, sessionId);
    }
}
