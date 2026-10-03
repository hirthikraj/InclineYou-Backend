package com.inclineyou.inclineyou_backend.core.auth.dto;

/** {@code GET /v1/auth/otp/requests/{requestId}} — {@code queued | sent | delivered | read | failed}. */
public record OtpDelivery(String deliveryStatus, String deliveryError, long expiresAt) {}
