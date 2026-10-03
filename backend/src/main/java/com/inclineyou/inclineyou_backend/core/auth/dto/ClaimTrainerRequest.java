package com.inclineyou.inclineyou_backend.core.auth.dto;

/**
 * {@code POST /v1/trainers}. The notice was accepted on the screen that led
 * here. Nullable on purpose: a missing version is {@code 400 CONSENT_REQUIRED},
 * the same answer as an outdated one, not a generic field error.
 * {@code app_user_privacy_pair} requires the version alongside
 * {@code privacyAcceptedAt}, so a trainer row never exists with one and not the
 * other.
 */
public record ClaimTrainerRequest(String privacyPolicyVersion) {}
