package com.inclineyou.inclineyou_backend.core.session.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * One session's outcome in a batch close.
 *
 * @param outcome {@code closed} · {@code skipped} · {@code not_found}
 * @param reason  on {@code skipped}: {@code ALREADY_CLOSED} · {@code NOT_STARTED}
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record EndResult(String sessionId, String outcome, String reason) {}
