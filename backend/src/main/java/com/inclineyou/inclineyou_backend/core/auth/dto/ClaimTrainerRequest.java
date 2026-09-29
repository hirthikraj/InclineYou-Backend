package com.inclineyou.inclineyou_backend.core.auth.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * {@code POST /v1/auth/trainer}. The notice was accepted on the screen that led
 * here — see api-contract.html#auth-a4. {@code app_user_privacy_pair} requires
 * this alongside {@code privacyAcceptedAt}, which is why the field is required
 * rather than optional: a trainer row with one and not the other is a consent
 * the database cannot represent as either given or not given.
 */
public record ClaimTrainerRequest(@NotBlank String privacyPolicyVersion) {}
