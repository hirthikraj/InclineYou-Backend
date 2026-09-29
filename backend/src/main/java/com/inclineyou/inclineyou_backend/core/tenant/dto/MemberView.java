package com.inclineyou.inclineyou_backend.core.tenant.dto;

import java.math.BigDecimal;

/** One coach or admin in a workspace — {@code GET /v1/tenants/{id}/members}. */
public record MemberView(
        String memberId, String appUserId, String trainerId, String phone,
        String name, String role, String status, boolean home,
        BigDecimal revenueSharePercent, BigDecimal assignmentMarginPercent,
        int clientCount
) {}
