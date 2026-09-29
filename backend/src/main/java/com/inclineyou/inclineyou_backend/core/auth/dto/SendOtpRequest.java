package com.inclineyou.inclineyou_backend.core.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/** {@code POST /v1/auth/otp/request}. */
public record SendOtpRequest(
        @NotBlank @Pattern(regexp = SendOtpRequest.PHONE_PATTERN, message = SendOtpRequest.PHONE_MESSAGE) String phone
) {
    /**
     * {@code +91} plus a 10-digit number starting 6–9 — the shape
     * {@code app_user_phone_format} actually enforces (and the one
     * {@code api-contract.html}'s {@code PHONE_INVALID} names), not the bare
     * 10 digits an older mobile build sent. Every phone that reaches this
     * backend is stored and compared in this one shape from here on.
     */
    public static final String PHONE_PATTERN = "^\\+91[6-9]\\d{9}$";
    public static final String PHONE_MESSAGE = "must be a valid Indian mobile number, e.g. +919876543210";
}
