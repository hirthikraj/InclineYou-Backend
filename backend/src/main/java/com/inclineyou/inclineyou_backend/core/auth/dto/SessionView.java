package com.inclineyou.inclineyou_backend.core.auth.dto;

import java.time.Instant;

/** One row of the "you are signed in on" list. */
public record SessionView(
        String id, String userAgent, Instant issuedAt, Instant lastSeenAt,
        Instant expiresAt, boolean current
) {}
