package com.inclineyou.inclineyou_backend.core.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/** {@code POST /v1/auth/otp/verify}. */
public record VerifyOtpRequest(
        @NotBlank @Pattern(regexp = SendOtpRequest.PHONE_PATTERN, message = SendOtpRequest.PHONE_MESSAGE) String phone,
        @NotBlank @Pattern(regexp = "^\\d{6}$", message = "must be a 6-digit code") String otp
) {}
