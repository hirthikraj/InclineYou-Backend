package com.inclineyou.inclineyou_backend.core.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/**
 * {@code POST /v1/auth/otp/verify}. The code is checked against the request it
 * was sent for, so no phone number rides here (api-contract R93). Its shape is
 * checked before the code, so a typo cannot spend one of the three attempts.
 */
public record VerifyOtpRequest(
        @NotBlank String requestId,
        @NotBlank @Pattern(regexp = "^\\d{6}$", message = "must be a 6-digit code") String otp
) {}
