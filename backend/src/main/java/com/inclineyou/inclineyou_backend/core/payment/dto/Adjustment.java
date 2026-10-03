package com.inclineyou.inclineyou_backend.core.payment.dto;

public record Adjustment(String id, String kind, int days, int sessions, String sessionId, String reason,
                         long effectiveAt, String dueDate, String previousDueDate, Long reversedAt,
                         long createdAt) {}
