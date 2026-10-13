package com.inclineyou.inclineyou_backend.core.client.dto;

/**
 * One {@code client_invite} on the wire (api-contract 1.2). {@code state} is {@code pending | expired | accepted |
 * declined | revoked}; {@code expired} is derived from {@code expires_at} and never stored. The token and its hash are
 * never part of this.
 */
public record InviteItem(
        String id,
        String clientId,
        String state,
        long createdAt,
        long expiresAt,
        Long acceptedAt,
        Long declinedAt,
        /** {@code not_for_me | age_requirement} */
        String declineReason,
        Long revokedAt,
        /** {@code replaced | number_changed | trainer | client_removed | erased} */
        String revokedReason
) {}
