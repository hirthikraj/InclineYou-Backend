package com.inclineyou.inclineyou_backend.core.business.dto;

import com.inclineyou.inclineyou_backend.shared.wire.Patch;
import jakarta.validation.constraints.NotBlank;

/**
 * {@code PUT /v1/business} (bz-a2): the whole form, one Save. Every field is the new value; null or blank is "none", except
 * {@code name}, which a workspace always has — and {@code upiVpa}, which since V50 (23 Nov 2026) is a {@link Patch}: absent
 * leaves it, because the UPI ID moved to Business → Payment setup ({@code PUT /v1/business/payments}) and a Settings save
 * that no longer draws it must not clear it. Sent (a value or null) it still sets or clears, so an older form keeps working.
 */
public record BusinessUpdate(
        @NotBlank(message = "required") String name,
        String tagline,
        String phone,
        String email,
        Business.Address address,
        Patch<String> upiVpa
) {}
