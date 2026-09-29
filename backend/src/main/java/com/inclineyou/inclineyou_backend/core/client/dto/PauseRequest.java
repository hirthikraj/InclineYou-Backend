package com.inclineyou.inclineyou_backend.core.client.dto;

import java.time.LocalDate;

/** {@code POST /v1/clients/{id}/pause} — the day they're back, or null for open-ended. */
public record PauseRequest(LocalDate pausedUntil) {}
