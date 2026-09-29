package com.inclineyou.inclineyou_backend.core.tenant;

import com.inclineyou.inclineyou_backend.core.tenant.dto.StaleClient;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * The SQL behind a handover — see {@link ClientHandoverService} for what moves
 * and what does not. Nothing here writes {@code tenant_id}: it is immutable
 * (V39's trigger), and a handover is a move within a workspace, never between two.
 *
 * <p>ponytail: still on the pre-25-Sep schema — {@code trainer.phone},
 * {@code client.assigned_by_app_user_id} / {@code assignment_margin_percent} /
 * {@code assigned_at}, {@code package.written_off_amount},
 * {@code scheduled_session.session_date} and
 * {@code client_assignment.actor_margin_percent} are gone. Moved here unchanged;
 * it fails until the tenant SQL is adapted to v1.
 */
@Repository
@RequiredArgsConstructor
public class ClientHandoverJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /** The handover change set, as one parameter bundle. */
    public record Reassignment(UUID tenantId, UUID clientId, UUID fromTrainerId, UUID toTrainerId,
                               UUID actorAppUserId, BigDecimal margin, String note, String reason) {}

    /**
     * Everyone in this workspace with no working coach, oldest first. The
     * outstanding balance travels with the row: sold minus collected, floored at
     * zero, and collected is {@code paid} OR {@code confirmed}.
     */
    public List<StaleClient> staleQueue(UUID tenantId) {
        return jdbc.query("""
                SELECT c.id::text         AS client_id,
                       c.name             AS name,
                       c.phone            AS phone,
                       c.trainer_id::text AS prev_trainer_id,
                       t.name             AS prev_trainer_name,
                       c.stale_reason     AS stale_reason,
                       c.stale_at         AS stale_at,
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
                """, Map.of("tid", tenantId.toString()), (rs, i) -> {
            Timestamp staleAt = rs.getTimestamp("stale_at");
            return new StaleClient(
                    rs.getString("client_id"), rs.getString("name"), rs.getString("phone"),
                    rs.getString("prev_trainer_id"), rs.getString("prev_trainer_name"),
                    rs.getString("stale_reason"), staleAt == null ? null : staleAt.toInstant(),
                    rs.getBigDecimal("outstanding"));
        });
    }

    /** Stamps every client this coach holds in this workspace. Returns how many. */
    public int markStale(UUID tenantId, UUID trainerId, String reason) {
        return jdbc.update("""
                UPDATE client
                SET stale_at = NOW(), stale_reason = :reason
                WHERE tenant_id = :tid::uuid
                  AND trainer_id = :trainer::uuid
                  AND deleted_at IS NULL
                  AND stale_at IS NULL
                """, Map.of("tid", tenantId.toString(), "trainer", trainerId.toString(), "reason", reason));
    }

    /** The client's coach now, or empty when the client is not in this workspace. */
    public Optional<UUID> currentTrainerOf(UUID tenantId, UUID clientId) {
        return jdbc.queryForList("""
                SELECT trainer_id::text FROM client
                WHERE id = :cid::uuid AND tenant_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("cid", clientId.toString(), "tid", tenantId.toString()), String.class)
                .stream().findFirst().map(UUID::fromString);
    }

    /** Whether this trainer actively coaches in this workspace. */
    public boolean isActiveCoach(UUID tenantId, UUID trainerId) {
        Integer coaches = jdbc.queryForObject("""
                SELECT COUNT(*) FROM tenant_member tm
                JOIN app_user au ON au.id = tm.app_user_id
                JOIN trainer t   ON t.phone = au.phone AND t.deleted_at IS NULL
                WHERE tm.tenant_id = :tid::uuid AND t.id = :trainer::uuid
                  AND tm.deleted_at IS NULL AND tm.status = 'active'
                """, Map.of("tid", tenantId.toString(), "trainer", trainerId.toString()), Integer.class);
        return coaches != null && coaches > 0;
    }

    /**
     * The client, their plan and their sessions still to come change coach; the
     * audit row records who did it and freezes their margin. Everything already
     * logged stays with whoever did it. {@code program_exercise} needs no update:
     * it has never carried a trainer_id and reaches its owner through
     * {@code program_id}, which has just moved.
     */
    public void reassign(Reassignment r) {
        var p = new MapSqlParameterSource()
                .addValue("cid", r.clientId().toString())
                .addValue("tid", r.tenantId().toString())
                .addValue("to", r.toTrainerId().toString())
                .addValue("from", r.fromTrainerId().toString())
                .addValue("actor", r.actorAppUserId() == null ? null : r.actorAppUserId().toString())
                .addValue("margin", r.margin())
                .addValue("note", r.note())
                .addValue("reason", r.reason());
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
        jdbc.update("""
                UPDATE program SET trainer_id = :to::uuid
                WHERE client_id = :cid::uuid AND tenant_id = :tid::uuid AND deleted_at IS NULL
                """, p);
        jdbc.update("""
                UPDATE scheduled_session SET trainer_id = :to::uuid
                WHERE client_id = :cid::uuid AND tenant_id = :tid::uuid
                  AND deleted_at IS NULL AND session_date >= CURRENT_DATE
                """, p);
        jdbc.update("""
                INSERT INTO client_assignment
                    (client_id, tenant_id, from_trainer_id, to_trainer_id,
                     actor_trainer_id, program_action, note, actor_margin_percent, reason)
                VALUES
                    (:cid::uuid, :tid::uuid,
                     :from::uuid, :to::uuid,
                     COALESCE((SELECT t.id FROM trainer t
                               JOIN app_user au ON au.phone = t.phone
                               WHERE au.id = :actor::uuid AND t.deleted_at IS NULL LIMIT 1),
                              :to::uuid),
                     'keep', :note, :margin, :reason)
                """, p);
    }
}
