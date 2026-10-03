package com.inclineyou.inclineyou_backend.core.nudge.dto;

/** {@code POST /v1/clients/{id}/nudges}. {@code id} is the caller's own, so a replay finds its row. */
public record DraftRequest(String id, String template, String packageId, String sessionId) {}
