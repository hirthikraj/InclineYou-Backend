package com.inclineyou.inclineyou_backend.core.tenant.dto;

/**
 * @param token null when the existing credential still works — which is the
 *              web case, and the client must NOT treat null as a sign-out.
 */
public record ActivateResponse(String tenantId, String token, String tokenKind) {}
