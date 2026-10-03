package com.inclineyou.inclineyou_backend.core.session.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * One session's outcome in a batch mark.
 *
 * @param outcome  {@code done} (marked, and charged if a pack took it) · {@code already_done} · {@code not_charged}
 *                 (marked, no pack took it — {@code reason} says why) · {@code skipped} (not marked — cancelled, or
 *                 its start time hasn't come) · {@code not_found}
 * @param reason   {@code PACKAGE_PAUSED} · {@code PACKAGE_EMPTY} · {@code NO_PACKAGE} · {@code SESSION_CANCELLED} ·
 *                 {@code SESSION_NOT_STARTED}
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record MarkResult(String sessionId, String outcome, String packageId, Integer sessionsRemaining, String reason) {}
