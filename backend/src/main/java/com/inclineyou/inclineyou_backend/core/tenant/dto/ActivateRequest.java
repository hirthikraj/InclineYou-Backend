package com.inclineyou.inclineyou_backend.core.tenant.dto;

/** {@code POST /v1/tenants/{id}/activate}. {@code remember} makes it the home workspace too. */
public record ActivateRequest(boolean remember) {}
