package com.inclineyou.inclineyou_backend.core.session.dto;

/** A charge taken back: the pack, what it has now, and whether it went back from completed to active (R67). */
public record Reversed(String packageId, Integer sessionsRemaining, boolean reopened) {}
