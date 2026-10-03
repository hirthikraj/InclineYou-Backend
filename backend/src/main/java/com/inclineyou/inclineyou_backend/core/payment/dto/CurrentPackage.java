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
        String version
) {}
