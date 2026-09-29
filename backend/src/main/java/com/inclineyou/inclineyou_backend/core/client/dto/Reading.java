package com.inclineyou.inclineyou_backend.core.client.dto;

import java.math.BigDecimal;

/** One measurement out of a completed assessment — {@code GET /v1/clients/{id}/readings}. */
public record Reading(String assessmentId, String key, String label, String unit, BigDecimal value, long at) {}
