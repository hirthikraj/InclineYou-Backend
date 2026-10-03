package com.inclineyou.inclineyou_backend.core.trainer.dto;

/**
 * DEPRECATED (3 Oct 2026) — the typed-number confirmation, replaced by the step-up
 * ticket in {@code X-Step-Up-Ticket}; remove after the web migration. Optional on the
 * wire now: absent, the ticket is required.
 */
public record DeleteAccountRequest(String confirmPhone) {}
