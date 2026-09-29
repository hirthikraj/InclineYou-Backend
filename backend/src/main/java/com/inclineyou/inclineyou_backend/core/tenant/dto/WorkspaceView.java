package com.inclineyou.inclineyou_backend.core.tenant.dto;

import java.math.BigDecimal;

/** One row of the workspace switcher — {@code GET /v1/tenants}. */
public record WorkspaceView(
        String id, String type, String name, String role,
        boolean home, boolean active, boolean administers,
        BigDecimal revenueSharePercent, BigDecimal assignmentMarginPercent
) {}
