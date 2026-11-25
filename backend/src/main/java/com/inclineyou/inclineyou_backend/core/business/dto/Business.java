package com.inclineyou.inclineyou_backend.core.business.dto;

import java.util.UUID;

/**
 * {@code GET /v1/business} (api-contract 1.2, bz-a1; V46): the active workspace's business. {@code name} is the workspace's
 * own name. {@code canEdit} is whether the caller owns the workspace — everyone else reads it.
 */
public record Business(
        UUID tenantId,
        String type,
        String name,
        String tagline,
        String phone,
        String email,
        Address address,
        String upiVpa,
        /** V50: may a client report paying part of what is left on a pack? Payment setup's switch; default on. */
        boolean partPayments,
        boolean canEdit,
        long updatedAt
) {
    /** Indian postal; every part optional. {@code state} is one of {@link com.inclineyou.inclineyou_backend.core.business.IndianStates}. */
    public record Address(String line1, String line2, String city, String state, String pincode) {}
}
