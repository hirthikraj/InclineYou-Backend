package com.inclineyou.inclineyou_backend.core.session.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * {@code POST /v1/sessions/{id}/billing}: the session as it now stands and, when it was already delivered, what the
 * change charged.
 *
 * @param charged true when a delivered session was charged by this call (to its pack, or to its own single sale)
 * @param reason  on a delivered session that stayed uncharged, why — the same codes Mark done answers
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record BillingResult(SessionRow session, boolean charged, String packageId, Integer sessionsRemaining,
                            String reason) {}
