package com.inclineyou.inclineyou_backend.core.tenant.dto;

/** A workspace as the shell draws it — the banner on {@code GET /v1/me}. */
public record Workspace(String id, String name, String currency, String country, String timezone) {}
