package com.inclineyou.inclineyou_backend.core.program.dto;

/** {@code GET /v1/programs/{id}/assignments} — one client on a copy of the template. */
public record Assignment(String programId, String programName, String clientId, String clientName, String status,
                         String startDate, String endDate, Long syncedAt, boolean behind, String version) {}
