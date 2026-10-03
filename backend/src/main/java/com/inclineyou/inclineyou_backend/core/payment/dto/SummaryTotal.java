package com.inclineyou.inclineyou_backend.core.payment.dto;

/** The month fields summed over the span, plus the trend on billed. */
public record SummaryTotal(
        String billed,
        String collected,
        String gymCut,
        String yours,
        String writtenOff,
        String refunded,
        int packagesSold,
        int paymentsCount,
        String takeHome,
        /** Billed against the same-length span before it; null when that span billed 0. */
        Double trendPercent
) {}
