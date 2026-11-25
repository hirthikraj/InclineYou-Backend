package com.inclineyou.inclineyou_backend.core.payment.dto;

/**
 * A client's "I've paid" (V50; api-contract 1.2, pc-l1). The same shape for the trainer's To confirm list and the client's
 * own Payments screen. Money is a string, as on every money row; {@code paidOn} is the day the client says they paid
 * (YYYY-MM-DD); {@code decidedAt} and {@code createdAt} are epoch ms.
 *
 * <p>{@code packageId} is null when the client paid before a pack was sold — confirming it is where the trainer sells one.
 * {@code collector} is {@code trainer}, or {@code gym} for a gym client who paid at the desk. {@code paymentId} is set
 * exactly when {@code status} is {@code confirmed}.
 */
public record PaymentClaim(
        String id,
        String clientId,
        String clientName,
        String packageId,
        String packageName,
        String amount,
        String currency,
        String paidOn,
        String reference,
        String note,
        String collector,
        /** open · confirmed · declined · withdrawn */
        String status,
        String paymentId,
        Long decidedAt,
        String declineReason,
        long createdAt
) {}
