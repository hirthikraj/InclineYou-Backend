package com.inclineyou.inclineyou_backend.core.nudge.dto;

/** The drafted message, the {@code wa.me} link that opens it in the trainer's own WhatsApp, and when it was logged. */
public record Draft(String id, String message, String whatsappUrl, long sentAt) {}
