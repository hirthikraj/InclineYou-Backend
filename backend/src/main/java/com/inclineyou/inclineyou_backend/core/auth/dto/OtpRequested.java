package com.inclineyou.inclineyou_backend.core.auth.dto;

/**
 * {@code POST /v1/auth/otp/request} → 200. The id carries no phone number; the
 * web keeps it in its httpOnly sign-in cookie.
 */
/**
 * {@code signupsPaused} (8 Nov 2026, appended): the day's budget of first codes to numbers with no account is spent.
 * The same for every number asked at the same moment, so it says nothing about the number; a number that already has
 * an account is still sent its code. Always false from the invite's code route, which does not use the flag.
 */
public record OtpRequested(String requestId, long expiresAt, int resendAfterSeconds, boolean signupsPaused) {}
