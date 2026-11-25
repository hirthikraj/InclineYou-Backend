package com.inclineyou.inclineyou_backend.core.business.dto;

import jakarta.validation.constraints.NotNull;

/**
 * {@code PUT /v1/business/payments} (V50, 23 Nov 2026): Business → Payment setup's one Save — the UPI ID clients pay and
 * whether a client may report paying part of a pack. Both are the new value; a null or blank UPI ID is "none".
 */
public record PaymentSetupUpdate(
        String upiVpa,
        @NotNull(message = "required") Boolean partPayments
) {}
