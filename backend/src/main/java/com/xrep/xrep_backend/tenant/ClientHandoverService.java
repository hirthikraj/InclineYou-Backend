package com.xrep.xrep_backend.tenant;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
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

    private final NamedParameterJdbcTemplate jdbc;
    private final TenantService tenants;

    public static final String REASON_LEFT = "trainer_left";
    public static final String REASON_UNAVAILABLE = "trainer_unavailable";
    public static final String REASON_MANUAL = "manual";

    public record StaleClient(
            String clientId, String name, String phone,
            String previousTrainerId, String previousTrainerName,
            String staleReason, java.time.Instant staleAt,
            BigDecimal outstanding
    ) {}

    /**
     * Everyone in this workspace with no working coach.
     *
     * <p>The outstanding balance travels with the row because it is the first
     * thing that makes one of these urgent: a client who has paid for eight
     * sessions and has nobody to take them is a refund waiting to happen.
     */
    public List<StaleClient> queue(UUID tenantId) {
        tenants.requireAdmin(tenantId);
        return jdbc.queryForList("""
                SELECT c.id::text         AS client_id,
                       c.name             AS name,
                       c.phone            AS phone,
                       c.trainer_id::text AS prev_trainer_id,
                       t.name             AS prev_trainer_name,
                       c.stale_reason     AS stale_reason,
                       c.stale_at         AS stale_at,
                       -- What is still owed: sold minus collected, floored at
                       -- zero. There is no `amount_due` column — the balance is
                       -- derived, and `collected` is 'paid' OR 'confirmed'
                       -- because REST writes the first and sync has carried the
                       -- second since V1.
                       GREATEST(
                           COALESCE((SELECT SUM(pk.amount - COALESCE(pk.discount_amount, 0)
                                                - COALESCE(pk.written_off_amount, 0))
                                     FROM package pk
                                     WHERE pk.client_id = c.id AND pk.deleted_at IS NULL), 0)
                         - COALESCE((SELECT SUM(pm.amount) FROM payment pm
                                     WHERE pm.client_id = c.id AND pm.deleted_at IS NULL
                                       AND pm.status IN ('paid', 'confirmed')), 0),
                           0) AS outstanding
                FROM client c
                LEFT JOIN trainer t ON t.id = c.trainer_id
                WHERE c.tenant_id = :tid::uuid
                  AND c.stale_at IS NOT NULL
                  AND c.deleted_at IS NULL
                ORDER BY c.stale_at
                """, Map.of("tid", tenantId.toString()))
                .stream()
                .map(r -> new StaleClient(
                        (String) r.get("client_id"), (String) r.get("name"), (String) r.get("phone"),
                        (String) r.get("prev_trainer_id"), (String) r.get("prev_trainer_name"),
                        (String) r.get("stale_reason"),
                        r.get("stale_at") == null ? null
                                : ((java.sql.Timestamp) r.get("stale_at")).toInstant(),
                        (BigDecimal) r.get("outstanding")))
                .toList();
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
        int n = jdbc.update("""
                UPDATE client
                SET stale_at = NOW(), stale_reason = :reason
                WHERE tenant_id = :tid::uuid
                  AND trainer_id = :trainer::uuid
                  AND deleted_at IS NULL
                  AND stale_at IS NULL
                """, Map.of("tid", tenantId.toString(),
                            "trainer", trainerId.toString(),
                            "reason", reason));
        if (n > 0) log.info("{} clients in tenant {} need a new coach ({})", n, tenantId, reason);
        return n;
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
    public void assign(UUID tenantId, UUID clientId, UUID toTrainerId, String note, String reason) {
        tenants.requireAdmin(tenantId);
        var scope = CurrentScope.require();

        var rows = jdbc.queryForList("""
                SELECT trainer_id::text AS from_trainer FROM client
                WHERE id = :cid::uuid AND tenant_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("cid", clientId.toString(), "tid", tenantId.toString()));
        if (rows.isEmpty()) throw TenantRuleException.notAMember();
        UUID fromTrainer = UUID.fromString((String) rows.getFirst().get("from_trainer"));

        // The receiving coach must actually coach here. Assigning to somebody
        // outside the workspace would create a row whose trainer cannot read it.
        Integer coaches = jdbc.queryForObject("""
                SELECT COUNT(*) FROM tenant_member tm
                JOIN app_user au ON au.id = tm.app_user_id
                JOIN trainer t   ON t.phone = au.phone AND t.deleted_at IS NULL
                WHERE tm.tenant_id = :tid::uuid AND t.id = :trainer::uuid
                  AND tm.deleted_at IS NULL AND tm.status = 'active'
                """, Map.of("tid", tenantId.toString(), "trainer", toTrainerId.toString()),
                Integer.class);
        if (coaches == null || coaches == 0) throw TenantRuleException.notACoachHere();

        BigDecimal margin = scope.active()
                .map(TenantScope.Membership::assignmentMarginPercent)
                .orElse(null);
        UUID actorAppUser = tenants.appUserIdFor(scope.phone());

        var p = new MapSqlParameterSource()
                .addValue("cid", clientId.toString())
                .addValue("tid", tenantId.toString())
                .addValue("to", toTrainerId.toString())
                .addValue("from", fromTrainer.toString())
                .addValue("actor", actorAppUser == null ? null : actorAppUser.toString())
                .addValue("margin", margin)
                .addValue("note", note)
                .addValue("reason", reason == null ? REASON_MANUAL : reason);

        // `tenant_id` is deliberately absent from this UPDATE. It is immutable —
        // V39's trigger refuses a change — and a handover is a move within a
        // workspace, never between two.
        jdbc.update("""
                UPDATE client
                SET trainer_id = :to::uuid,
                    stale_at = NULL,
                    stale_reason = NULL,
                    assigned_by_app_user_id = :actor::uuid,
                    assignment_margin_percent = :margin,
                    assigned_at = NOW()
                WHERE id = :cid::uuid AND tenant_id = :tid::uuid AND deleted_at IS NULL
                """, p);

        // The plan and the sessions still to come follow the client; everything
        // already logged stays with whoever did it.
        jdbc.update("""
                UPDATE program SET trainer_id = :to::uuid
                WHERE client_id = :cid::uuid AND tenant_id = :tid::uuid AND deleted_at IS NULL
                """, p);
        // `program_exercise` needs no update: it has never carried a trainer_id
        // and reaches its owner through `program_id`, which has just moved.
        jdbc.update("""
                UPDATE scheduled_session SET trainer_id = :to::uuid
                WHERE client_id = :cid::uuid AND tenant_id = :tid::uuid
                  AND deleted_at IS NULL AND session_date >= CURRENT_DATE
                """, p);

        jdbc.update("""
                INSERT INTO client_assignment
                    (client_id, tenant_id, team_id, from_trainer_id, to_trainer_id,
                     actor_trainer_id, program_action, note, actor_margin_percent, reason)
                VALUES
                    (:cid::uuid, :tid::uuid,
                     (SELECT id FROM team WHERE tenant_id = :tid::uuid AND deleted_at IS NULL LIMIT 1),
                     :from::uuid, :to::uuid,
                     COALESCE((SELECT t.id FROM trainer t
                               JOIN app_user au ON au.phone = t.phone
                               WHERE au.id = :actor::uuid AND t.deleted_at IS NULL LIMIT 1),
                              :to::uuid),
                     'keep', :note, :margin, :reason)
                """, p);

        log.info("client {} handed from {} to {} in tenant {}", clientId, fromTrainer, toTrainerId, tenantId);
    }
}
