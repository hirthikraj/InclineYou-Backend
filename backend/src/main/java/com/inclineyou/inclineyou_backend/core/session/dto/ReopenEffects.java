package com.inclineyou.inclineyou_backend.core.session.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ReopenEffects(boolean chargeReversed, String packageId, Integer sessionsRemaining,
                            boolean packageReopened) {}
