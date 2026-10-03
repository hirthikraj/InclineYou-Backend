package com.inclineyou.inclineyou_backend.core.session.dto;

/** What a charge attempt came to: {@code charged}, or why not ({@code NO_PACKAGE} · {@code PACKAGE_PAUSED} · {@code PACKAGE_EMPTY}). */
public record Charged(boolean charged, String packageId, Integer sessionsRemaining, String reason) {}
