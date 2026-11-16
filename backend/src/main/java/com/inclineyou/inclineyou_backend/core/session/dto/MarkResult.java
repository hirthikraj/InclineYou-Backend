package com.inclineyou.inclineyou_backend.core.session.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * One session's outcome in a batch mark.
 *
 * @param outcome  {@code done} (marked, and charged if a pack took it) · {@code already_done} · {@code not_charged}
 *                 (marked, no pack took it — {@code reason} says why) · {@code skipped} (not marked — cancelled, or
 *                 its start time hasn't come) · {@code not_found} · {@code failed} (13 Nov 2026: the database refused
 *                 it in the moment — nothing about it changed; marking again retries it, the batch's other sessions
 *                 stand)
 * @param reason   {@code PACKAGE_PAUSED} · {@code PACKAGE_EMPTY} · {@code NO_PACKAGE} · {@code TRIAL} ·
 *                 {@code COMPLIMENTARY} · {@code SINGLE_GYM_CLIENT} · {@code SESSION_CANCELLED} ·
 *                 {@code SESSION_NOT_STARTED} · {@code MARK_FAILED}
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record MarkResult(String sessionId, String outcome, String packageId, Integer sessionsRemaining, String reason) {}
