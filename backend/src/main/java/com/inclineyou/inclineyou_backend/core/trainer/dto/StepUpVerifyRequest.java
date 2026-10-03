package com.inclineyou.inclineyou_backend.core.trainer.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/** {@code POST /v1/auth/step-up/verify} — the code that was sent, for the purpose it was sent for. */
public record StepUpVerifyRequest(
        @NotBlank String purpose,
        @NotBlank @Pattern(regexp = "^\\d{6}$", message = "must be a 6-digit code") String otp
) {}
