package com.inclineyou.inclineyou_backend.core.trainer.dto;

/**
 * {@code POST /v1/trainers/me/consent}. The version is NOT {@code @NotBlank}: a missing one is the
 * same answer as a stale one — {@code CONSENT_REQUIRED}, "reload the notice" — not a malformed body.
 */
public record ConsentRequest(String policyVersion) {}
