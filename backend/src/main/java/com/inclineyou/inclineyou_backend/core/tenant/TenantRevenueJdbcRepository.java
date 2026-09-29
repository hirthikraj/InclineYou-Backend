package com.inclineyou.inclineyou_backend.core.tenant;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The SQL behind {@code GET /v1/tenants/{id}/revenue}. Collected means
 * {@code paid} OR {@code confirmed} — REST writes the first and sync has
 * carried the second since V1.
 *
 * <p>ponytail: still on the pre-25-Sep schema ({@code trainer.phone},
 * {@code tenant_member.revenue_share_percent}, {@code client.assignment_margin_percent}
 * are gone). Moved here unchanged; it fails until adapted to v1.
 */
@Repository
@RequiredArgsConstructor
public class TenantRevenueJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /** One coach's collections in the window, before the share is applied. */
    public record Collections(String trainerId, String trainerName, BigDecimal collected,
                              int payments, int clients, BigDecimal sharePercent) {}

    /**
     * Per coach, largest first.
     *
     * @param trainerId null for every coach in the workspace; otherwise only
     *                  this one — the wall INSIDE a workspace, which RLS tier 2
     *                  deliberately does not draw (see {@link TenantRevenueService})
     */
    public List<Collections> collections(UUID tenantId, LocalDate from, LocalDate to, UUID trainerId) {
        var p = new HashMap<String, Object>();
        p.put("tid", tenantId.toString());
        p.put("from", from);
        p.put("to", to);
        p.put("trainer", trainerId == null ? null : trainerId.toString());
        String coachFilter = trainerId == null ? "" : " AND p.trainer_id = :trainer::uuid ";
        return jdbc.query("""
                SELECT p.trainer_id::text AS trainer_id,
                       t.name             AS trainer_name,
                       SUM(p.amount)      AS collected,
                       COUNT(*)           AS payments,
                       COUNT(DISTINCT p.client_id) AS clients,
                       (SELECT tm.revenue_share_percent
                          FROM tenant_member tm
                          JOIN app_user au ON au.id = tm.app_user_id
                         WHERE tm.tenant_id = :tid::uuid
                           AND au.phone = t.phone
                           AND tm.deleted_at IS NULL
                         LIMIT 1) AS share_percent
                FROM payment p
                JOIN trainer t ON t.id = p.trainer_id
                WHERE p.tenant_id = :tid::uuid
                  AND p.deleted_at IS NULL
                  AND p.status IN ('paid', 'confirmed')
                  AND p.paid_at >= :from
                  AND p.paid_at < (CAST(:to AS date) + 1)
                """ + coachFilter + """
                GROUP BY p.trainer_id, t.name, t.phone
                ORDER BY SUM(p.amount) DESC
                """, p, (rs, i) -> new Collections(
                rs.getString("trainer_id"), rs.getString("trainer_name"), rs.getBigDecimal("collected"),
                rs.getInt("payments"), rs.getInt("clients"), rs.getBigDecimal("share_percent")));
    }

    /**
     * What the admin behind {@code phone} earned placing clients with OTHER
     * coaches, at the margin frozen on each client — never their current rate.
     * Null when there is nothing.
     */
    public BigDecimal placementMargin(UUID tenantId, String phone, LocalDate from, LocalDate to) {
        return jdbc.queryForObject("""
                SELECT COALESCE(SUM(p.amount * c.assignment_margin_percent / 100), 0) AS margin
                FROM payment p
                JOIN client c ON c.id = p.client_id
                JOIN app_user au ON au.id = c.assigned_by_app_user_id
                WHERE p.tenant_id = :tid::uuid
                  AND p.deleted_at IS NULL
                  AND p.status IN ('paid', 'confirmed')
                  AND p.paid_at >= :from
                  AND p.paid_at < (CAST(:to AS date) + 1)
                  AND au.phone = :phone
                  AND c.assignment_margin_percent IS NOT NULL
                  AND c.trainer_id <> COALESCE(
                        (SELECT t.id FROM trainer t WHERE t.phone = :phone AND t.deleted_at IS NULL LIMIT 1),
                        '00000000-0000-0000-0000-000000000000'::uuid)
                """, Map.of("tid", tenantId.toString(), "from", from, "to", to, "phone", phone), BigDecimal.class);
    }
}
