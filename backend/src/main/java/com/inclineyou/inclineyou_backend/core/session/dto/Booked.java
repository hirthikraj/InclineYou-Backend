package com.inclineyou.inclineyou_backend.core.session.dto;

/** The session in the L4 shape, and whether this call made it (201) or found it (200). */
public record Booked(SessionRow session, boolean created) {}
