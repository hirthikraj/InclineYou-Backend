package com.inclineyou.inclineyou_backend.core.auth.dto;

/**
 * {@code POST /v1/auth/otp/request}. The number is shape-checked by the service,
 * not by Bean Validation, so a malformed one answers {@code 400 PHONE_INVALID}
 * (the code the screen branches on) rather than a generic field error.
 */
public record SendOtpRequest(String phone) {
    /**
     * {@code +91} plus a 10-digit number starting 6–9 — the shape
     * {@code app_user_phone_format} actually enforces. Every phone that reaches
     * this backend is stored and compared in this one shape.
     */
    public static final String PHONE_PATTERN = "^\\+91[6-9]\\d{9}$";
    public static final String PHONE_MESSAGE = "must be a valid Indian mobile number, e.g. +919876543210";
}
