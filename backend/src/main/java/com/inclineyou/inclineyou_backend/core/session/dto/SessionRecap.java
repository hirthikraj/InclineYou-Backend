package com.inclineyou.inclineyou_backend.core.session.dto;

/** The trainer's recap for a session (client_message, kind recap) — enough to know there is one and whether it was opened. */
public record SessionRecap(String id, Long readAt) {}
