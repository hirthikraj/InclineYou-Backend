package com.inclineyou.inclineyou_backend.core.tenant.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** {@code GET /v1/tenants/{id}/revenue} — what the role is allowed to see of it. */
public record RevenueView(
        String tenantId, LocalDate from, LocalDate to,
        String role,
        /** The workspace total. Null for a coach, who is not shown one. */
        BigDecimal collected,
        /** One line for a coach; every line for an admin. */
        List<CoachLine> coaches,
        /** What this caller personally keeps. */
        BigDecimal myShare,
        /** What this caller earned by placing clients with other coaches. */
        BigDecimal myPlacementMargin
) {
    public record CoachLine(
            String trainerId, String trainerName,
            BigDecimal collected, int payments, int clientsWhoPaid,
            BigDecimal sharePercent, BigDecimal share
    ) {}
}
