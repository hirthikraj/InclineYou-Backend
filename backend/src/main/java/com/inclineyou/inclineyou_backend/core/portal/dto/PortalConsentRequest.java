package com.inclineyou.inclineyou_backend.core.portal.dto;

/**
 * {@code POST /v1/portal/consent}. Not {@code @NotBlank}, like the trainer's: a missing version is the same answer as a stale one —
 * {@code CONSENT_REQUIRED}, "reload the notice" — not a malformed body.
 */
public record PortalConsentRequest(String policyVersion) {}
