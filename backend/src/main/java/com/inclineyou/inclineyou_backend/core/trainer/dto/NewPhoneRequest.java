package com.inclineyou.inclineyou_backend.core.trainer.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * {@code POST /v1/trainers/me/phone/request}. {@code phone} is NOT pattern-validated
 * here: a malformed number must come back as {@code 400 PHONE_INVALID} with a
 * sentence the screen can put under the field, not as the generic VALIDATION list,
 * so the service checks it ({@code AccountService}) against the sign-in rule.
 */
public record NewPhoneRequest(@NotBlank String ticket, @NotBlank String phone) {}
