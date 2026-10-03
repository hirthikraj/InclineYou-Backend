package com.inclineyou.inclineyou_backend.core.nudge.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * api-contract Today L9 / Client file L3 — who was messaged, when, and why.
 * {@code message} only with {@code include=message}: opt-in on any query,
 * rather than switched on by {@code clientId}, because a field that appears
 * and disappears with a filter is a trap for every typed client.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record NudgeSummary(String id, String clientId, String template, String reason, long sentAt,
                           String message,
                           /** sent_at at full precision, for the cursor only — never on the wire. */
                           @JsonIgnore String cursorKey) {}
