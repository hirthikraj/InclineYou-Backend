package com.inclineyou.inclineyou_backend.core.tenant;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * What a workspace took, and who is owed which part of it.
 *
 * <h2>Three answers, and the role decides which you get</h2>
 *
 * <ul>
 *   <li>An <b>owner, admin or gym administrator</b> sees the workspace total and
 *       the split per coach. They are running the business; the numbers are what
 *       they are running it on.</li>
 *   <li>A <b>coach</b> sees their own collections and their own share, and
 *       nothing about anybody else. Not a total they are part of, not a rank —
 *       one line, theirs.</li>
 *   <li>Any <b>admin who has placed clients</b> also sees what those placements
 *       earned them, at the margin frozen onto each handover.</li>
 * </ul>
 *
 * <h2>Why the database cannot enforce the coach case</h2>
 *
 * Tier 2 of the RLS policies is {@code tenant_id = app_tenant_id()}: money
 * belongs to one workspace and you must be standing in it. It is deliberately
 * NOT keyed on {@code trainer_id}, because in a gym the collector of record is
 * the gym and its administrators must be able to read payments whose
 * {@code trainer_id} is a coach — a trainer_id predicate would block exactly the
 * person who banked the money.
 *
 * <p>So "a coach sees only their own" is an application rule, enforced here, in
 * one place, by putting {@code trainer_id} into the query rather than trusting
 * every caller to. The database's job is the wall between workspaces; this
 * class's job is the wall inside one.
 *
 * <h2>Collected means paid OR confirmed</h2>
 *
 * REST writes {@code paid} and sync has carried {@code confirmed} since V1.
 * Counting only one of them silently halves a trainer's month.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TenantRevenueService {

    private final NamedParameterJdbcTemplate jdbc;

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    public record CoachLine(
            String trainerId, String trainerName,
            BigDecimal collected, int payments, int clientsWhoPaid,
            BigDecimal sharePercent, BigDecimal share
    ) {}

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
    ) {}

    public RevenueView revenue(UUID tenantId, LocalDate from, LocalDate to) {
        var scope = CurrentScope.require();
        if (!scope.isMemberOf(tenantId)) throw TenantRuleException.notAMember();

        String role = scope.memberships().stream()
                .filter(m -> m.tenantId().equals(tenantId))
                .map(TenantScope.Membership::role)
                .findFirst().orElse(TenantRole.COACH);

        boolean wholeWorkspace = TenantRole.readsTenantRevenue(role);

        var params = Map.<String, Object>of(
                "tid", tenantId.toString(),
                "from", from,
                "to", to,
                "trainer", scope.trainerId() == null ? null : scope.trainerId().toString());

        // The trainer_id predicate is applied here and not by a policy — see the
        // class comment. `:trainer IS NULL` makes the same statement serve both
        // shapes without a second copy of it to drift.
        String coachFilter = wholeWorkspace ? "" : " AND p.trainer_id = :trainer::uuid ";

        List<CoachLine> lines = jdbc.queryForList("""
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
                """, params)
                .stream()
                .map(r -> {
                    BigDecimal collected = (BigDecimal) r.get("collected");
                    BigDecimal pct = (BigDecimal) r.get("share_percent");
                    return new CoachLine(
                            (String) r.get("trainer_id"),
                            (String) r.get("trainer_name"),
                            collected,
                            ((Number) r.get("payments")).intValue(),
                            ((Number) r.get("clients")).intValue(),
                            pct,
                            share(collected, pct));
                })
                .toList();

        BigDecimal total = wholeWorkspace
                ? lines.stream().map(CoachLine::collected).reduce(BigDecimal.ZERO, BigDecimal::add)
                : null;

        BigDecimal myShare = lines.stream()
                .filter(l -> scope.trainerId() != null && l.trainerId().equals(scope.trainerId().toString()))
                .map(CoachLine::share)
                .findFirst().orElse(BigDecimal.ZERO);

        return new RevenueView(tenantId.toString(), from, to, role,
                total, lines, myShare, placementMargin(tenantId, scope, from, to));
    }

    /**
     * What an admin earned by placing clients with other coaches.
     *
     * <p>Computed from the margin FROZEN on each client at the moment of the
     * handover, not from the admin's current rate — renegotiating in March must
     * not restate what was earned in January. Clients this admin placed with
     * THEMSELVES are excluded: a margin for handing yourself a client would be
     * a number with no counterparty.
     */
    private BigDecimal placementMargin(UUID tenantId, TenantScope.Scope scope,
                                       LocalDate from, LocalDate to) {
        var rows = jdbc.queryForList("""
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
                """, Map.of("tid", tenantId.toString(), "from", from, "to", to,
                            "phone", scope.phone()));
        BigDecimal m = (BigDecimal) rows.getFirst().get("margin");
        return m == null ? BigDecimal.ZERO : m.setScale(2, RoundingMode.HALF_UP);
    }

    /** NULL percent means all of it, which is the only right answer for a solo tenant. */
    private static BigDecimal share(BigDecimal collected, BigDecimal percent) {
        if (collected == null) return BigDecimal.ZERO;
        if (percent == null) return collected.setScale(2, RoundingMode.HALF_UP);
        return collected.multiply(percent).divide(HUNDRED, 2, RoundingMode.HALF_UP);
    }
}
