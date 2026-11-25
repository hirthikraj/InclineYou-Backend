package com.inclineyou.inclineyou_backend.core.join.dto;

import java.util.UUID;

/**
 * The client approval made. {@code packId} is the plan they picked, for the web to go on to selling it; {@code checkInSent} is
 * whether the link's check-in assessment went to them.
 */
public record JoinApproved(UUID clientId, UUID packId, boolean checkInSent) {}
