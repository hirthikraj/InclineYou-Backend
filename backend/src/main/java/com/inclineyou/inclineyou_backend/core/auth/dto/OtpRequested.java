package com.inclineyou.inclineyou_backend.core.auth.dto;

/**
 * {@code POST /v1/auth/otp/request} → 200. The id carries no phone number; the
 * web keeps it in its httpOnly sign-in cookie.
 */
public record OtpRequested(String requestId, long expiresAt, int resendAfterSeconds) {}
