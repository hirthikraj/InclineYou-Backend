package com.inclineyou.inclineyou_backend.core.session.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * @param reason on {@code charged: false}, why not — only when a charge was asked for and no pack could take it
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record NoShowResult(String sessionId, String status, boolean charged,
                           String packageId, Integer sessionsRemaining, String reason) {}
