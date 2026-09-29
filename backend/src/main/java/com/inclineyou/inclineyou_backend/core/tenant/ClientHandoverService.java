package com.inclineyou.inclineyou_backend.core.tenant;

import com.inclineyou.inclineyou_backend.core.tenant.dto.AssignClientRequest;
import com.inclineyou.inclineyou_backend.core.tenant.dto.MarkUnavailableRequest;
import com.inclineyou.inclineyou_backend.core.tenant.dto.StaleClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * A client whose coach is gone, and the admin who gives them a new one.
 *
 * <h2>Stale is a column, not a status</h2>
 *
 * A client whose coach walked out is still an active client: still paying, still
 * owed sessions, still on the roster. What is missing is a coach. So
 * {@code stale_at} is its own column and {@code status} is untouched — every
 * {@code WHERE status = 'active'} read on the server AND on every phone in the
 * field keeps counting them, and only the handover screen asks the new question.
 * V30 made exactly this call for {@code paused_at} and gave exactly this reason.
 *
 * <h2>What moves and what does not</h2>
 *
 * <b>The client keeps everything.</b> Their measurements, their logged sessions,
 * their payments and their plan are the same rows before and after — this is a
 * change of coach, not a new relationship, and a handover that lost the history
 * would make the trainer's absence the client's problem.
 *
 * <p>What changes hands is the FORWARD-LOOKING work: {@code client.trainer_id},
 * the current program and the sessions still to come. What stays with the
 * original coach is what already happened — logged workouts and collected
 * payments keep their {@code trainer_id}, because they are a record of who did
 * the work and who took the money, and rewriting that would falsify both the
 * books and the audit.
 *
 * <p>Nothing changes {@code tenant_id}. A handover happens INSIDE a workspace;
 * the row does not move and V39's trigger would refuse it if this tried.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ClientHandoverService {

    private final ClientHandoverJdbcRepository repo;
    private final TenantService tenants;

    public static final String REASON_LEFT = "trainer_left";
    public static final String REASON_UNAVAILABLE = "trainer_unavailable";
    public static final String REASON_MANUAL = "manual";

    /**
     * Everyone in this workspace with no working coach.
     *
     * <p>The outstanding balance travels with the row because it is the first
     * thing that makes one of these urgent: a client who has paid for eight
     * sessions and has nobody to take them is a refund waiting to happen.
     */
    public List<StaleClient> queue(UUID tenantId) {
        tenants.requireAdmin(tenantId);
        return repo.staleQueue(tenantId);
    }

    /**
     * Mark every client this coach holds in this workspace as needing a new one.
     *
     * <p>Called when a coach leaves or is removed. It does NOT touch their
     * clients in any other workspace — their private practice is a different
     * tenant and was never in scope, which is the whole reason leaving a gym is
     * cheap.
     *
     * @return how many clients now need a coach
     */
    @Transactional
    public int markStale(UUID tenantId, UUID trainerId, String reason) {
        int n = repo.markStale(tenantId, trainerId, reason);
        if (n > 0) log.info("{} clients in tenant {} need a new coach ({})", n, tenantId, reason);
        return n;
    }

    /**
     * A coach has stopped working here: an admin marks everyone they hold in
     * THIS workspace as needing a new one. A null reason is
     * {@link #REASON_UNAVAILABLE}.
     */
    @Transactional
    public int markUnavailable(UUID tenantId, UUID trainerId, MarkUnavailableRequest req) {
        tenants.requireAdmin(tenantId);
        String reason = req.reason() == null ? REASON_UNAVAILABLE : req.reason();
        return markStale(tenantId, trainerId, reason);
    }

    /**
     * Give a client a coach.
     *
     * <p>The admin doing it is recorded on the row and their margin is FROZEN
     * onto it, so what they earn on this client is what was agreed the day they
     * placed them. {@code client_assignment} gets the audit row; the client's
     * own history is untouched.
     */
    @Transactional
    public void assign(UUID tenantId, UUID clientId, AssignClientRequest req) {
        UUID toTrainerId = req.toTrainerId();
        tenants.requireAdmin(tenantId);
        var scope = CurrentScope.require();

        UUID fromTrainer = repo.currentTrainerOf(tenantId, clientId).orElseThrow(TenantRuleException::notAMember);

        // The receiving coach must actually coach here. Assigning to somebody
        // outside the workspace would create a row whose trainer cannot read it.
        if (!repo.isActiveCoach(tenantId, toTrainerId)) throw TenantRuleException.notACoachHere();

        BigDecimal margin = scope.active()
                .map(TenantScope.Membership::assignmentMarginPercent)
                .orElse(null);
        repo.reassign(new ClientHandoverJdbcRepository.Reassignment(tenantId, clientId, fromTrainer, toTrainerId,
                tenants.appUserIdFor(scope.phone()), margin, req.note(),
                req.reason() == null ? REASON_MANUAL : req.reason()));

        log.info("client {} handed from {} to {} in tenant {}", clientId, fromTrainer, toTrainerId, tenantId);
    }
}
