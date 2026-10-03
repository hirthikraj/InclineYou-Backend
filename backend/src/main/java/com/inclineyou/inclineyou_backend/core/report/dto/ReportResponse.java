package com.inclineyou.inclineyou_backend.core.report.dto;

/** {@code GET /v1/clients/{id}/report} — the report as the WhatsApp-ready text. */
public record ReportResponse(String report) {}
