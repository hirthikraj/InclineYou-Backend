package com.inclineyou.inclineyou_backend.core.tenant;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import com.inclineyou.inclineyou_backend.core.tenant.dto.RevenueView;
import com.inclineyou.inclineyou_backend.core.tenant.dto.RevenueView.CoachLine;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
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

    private final TenantRevenueJdbcRepository repo;

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    public RevenueView revenue(UUID tenantId, LocalDate from, LocalDate to) {
        var scope = CurrentScope.require();
        if (!scope.isMemberOf(tenantId)) throw TenantRuleException.notAMember();

        String role = scope.memberships().stream()
                .filter(m -> m.tenantId().equals(tenantId))
                .map(TenantScope.Membership::role)
                .findFirst().orElse(TenantRole.COACH);

        boolean wholeWorkspace = TenantRole.readsTenantRevenue(role);

        // The trainer_id predicate is applied here and not by a policy — see the
        // class comment. A coach with no trainer row has no line of their own,
        // and must not fall through to the whole-workspace read.
        List<CoachLine> lines = !wholeWorkspace && scope.trainerId() == null ? List.of()
                : repo.collections(tenantId, from, to, wholeWorkspace ? null : scope.trainerId()).stream()
                        .map(c -> new CoachLine(c.trainerId(), c.trainerName(), c.collected(),
                                c.payments(), c.clients(), c.sharePercent(), share(c.collected(), c.sharePercent())))
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
        BigDecimal m = repo.placementMargin(tenantId, scope.phone(), from, to);
        return m == null ? BigDecimal.ZERO : m.setScale(2, RoundingMode.HALF_UP);
    }

    /** NULL percent means all of it, which is the only right answer for a solo tenant. */
    private static BigDecimal share(BigDecimal collected, BigDecimal percent) {
        if (collected == null) return BigDecimal.ZERO;
        if (percent == null) return collected.setScale(2, RoundingMode.HALF_UP);
        return collected.multiply(percent).divide(HUNDRED, 2, RoundingMode.HALF_UP);
    }
}
