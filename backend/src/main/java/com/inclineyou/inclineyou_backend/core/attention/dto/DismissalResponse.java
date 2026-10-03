package com.inclineyou.inclineyou_backend.core.attention.dto;

/**
 * No id: the table's key is (trainer_id, client_id, kind), so a row is addressed by clientId + kind (api-contract R1).
 * One silence per client per kind is the correct shape, and the wire says so.
 *
 * @param snoozedUntil null for a permanent dismissal
 */
public record DismissalResponse(String clientId, String kind, String band, Long snoozedUntil, long createdAt) {}
