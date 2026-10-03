package com.inclineyou.inclineyou_backend.core.trainer.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * {@code POST /v1/auth/step-up}. {@code purpose} is validated in the service, not by
 * a pattern, so an unknown one is the same 400 VALIDATION with the same sentence
 * wherever it arrives and the accepted list lives in one place
 * ({@link com.inclineyou.inclineyou_backend.core.trainer.StepUpService#PURPOSES}).
 */
public record StepUpRequest(@NotBlank String purpose) {}
