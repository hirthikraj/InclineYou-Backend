package com.inclineyou.inclineyou_backend.core.payment.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;

public record PaymentRow(
        String id,
        String clientId,
        String packageId,
        String clientName,
        String packageName,
        String amount,
        String currency,
        String collectedBy,
        String method,
        String status,
        String reference,
        String note,
        Long paidAt,
        Long writtenOffAt,
        Long refundedAt,
        /** The instant the row counts on — paidAt · writtenOffAt · refundedAt · createdAt (pending). The order. */
        long bookAt,
        Split split,
        long createdAt,
        String version,
        /** bookAt at full precision, for the cursor only — never on the wire. */
        @JsonIgnore String cursorKey
) {}
