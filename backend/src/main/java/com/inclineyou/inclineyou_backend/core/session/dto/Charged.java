package com.inclineyou.inclineyou_backend.core.session.dto;

/**
 * What a charge attempt came to: {@code charged}, or why not — {@code NO_PACKAGE} · {@code PACKAGE_PAUSED} ·
 * {@code PACKAGE_EMPTY} (a pack session nothing could pay for: money to chase), or {@code TRIAL} · {@code COMPLIMENTARY}
 * (free on purpose, V32), or {@code SINGLE_GYM_CLIENT} (a single session for a client who has since become a gym's).
 */
public record Charged(boolean charged, String packageId, Integer sessionsRemaining, String reason) {}
