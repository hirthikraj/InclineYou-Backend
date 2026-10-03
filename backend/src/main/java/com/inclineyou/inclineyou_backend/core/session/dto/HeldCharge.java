package com.inclineyou.inclineyou_backend.core.session.dto;

/** The charge a session already carries, and what the pack it came off has left. */
public record HeldCharge(String packageId, Integer sessionsRemaining) {}
