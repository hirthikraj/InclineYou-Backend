package com.inclineyou.inclineyou_backend.core.session.dto;

/** The pack that should pay for a session: the best candidate, which may be paused or empty. */
public record PayingPack(String id, int sessionsRemaining, boolean paused) {}
