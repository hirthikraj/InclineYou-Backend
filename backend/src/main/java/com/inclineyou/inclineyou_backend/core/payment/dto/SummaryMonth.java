package com.inclineyou.inclineyou_backend.core.payment.dto;

public record SummaryMonth(
        String month,
        String billed,
        String collected,
        String gymCut,
        String yours,
        String writtenOff,
        String refunded,
        int packagesSold,
        int paymentsCount,
        /** Collected less the gym's part of it — what the trainer actually received. */
        String takeHome
) {}
