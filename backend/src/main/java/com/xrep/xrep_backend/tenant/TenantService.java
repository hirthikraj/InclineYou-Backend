package com.xrep.xrep_backend.tenant;

import com.xrep.xrep_backend.config.AppProperties;
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
 * Workspaces, the people in them, and what each of them keeps.
 *
 * <h2>A person belongs to several workspaces</h2>
 *
 * That is the requirement this whole layer exists for. One trainer coaches
 * privately and at a gym with different clients; one human can be a client under
 * two different arrangements. So membership is a table, not a column, and every
 * method here works in terms of "which workspace are we talking about" rather
 * than "who is the caller".
 *
 * <h2>Nothing here moves data</h2>
 *
 * Joining a workspace creates a membership. Leaving one soft-deletes it. Neither
 * touches a single client, program, session or payment — because those rows were
 * stamped with the workspace they were created in and V39's trigger refuses to
 * move them. A coach who leaves a gym stops being able to READ the gym's rows;
 * the rows do not follow them out, and their private practice was never in
 * scope to begin with.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TenantService {

    private final NamedParameterJdbcTemplate jdbc;
    private final TenantScope scope;
    private final AppProperties props;

    public record WorkspaceView(
            String id, String type, String name, String role,
            boolean home, boolean active, boolean administers,
            BigDecimal revenueSharePercent, BigDecimal assignmentMarginPercent
    ) {}

    public record MemberView(
            String memberId, String appUserId, String trainerId, String phone,
            String name, String role, String status, boolean home,
            BigDecimal revenueSharePercent, BigDecimal assignmentMarginPercent,
            int clientCount
    ) {}

    /** The switcher at the top of the app. */
    public List<WorkspaceView> myWorkspaces() {
        var s = CurrentScope.require();
        return s.memberships().stream()
                .map(m -> new WorkspaceView(
                        m.tenantId().toString(), m.tenantType(), m.tenantName(), m.role(),
                        m.home(), m.tenantId().equals(s.activeTenantId()),
                        TenantRole.administers(m.role()),
                        m.revenueSharePercent(), m.assignmentMarginPercent()))
                .toList();
    }

    /**
     * Which workspace this caller is standing in from now on.
     *
     * <p>Refused for a workspace they are not a member of, and refused with
     * {@code NOT_A_MEMBER} rather than a silent fallback — a switcher that
     * quietly puts you somewhere else is worse than one that says no.
     */
    public UUID requireSwitchable(UUID tenantId) {
        if (!props.getTenant().isSwitchingEnabled()) throw TenantRuleException.switchingDisabled();
        var s = CurrentScope.require();
        if (!s.isMemberOf(tenantId)) throw TenantRuleException.notAMember();
        return tenantId;
    }

    /** Remember it, so the next sign-in opens here. */
    @Transactional
    public void makeHome(String phone, UUID tenantId) {
        jdbc.update("""
                UPDATE tenant_member tm SET is_home = FALSE
                FROM app_user au
                WHERE au.id = tm.app_user_id AND au.phone = :phone AND tm.is_home
                """, Map.of("phone", phone));
        jdbc.update("""
                UPDATE tenant_member tm SET is_home = TRUE
                FROM app_user au
                WHERE au.id = tm.app_user_id AND au.phone = :phone
                  AND tm.tenant_id = :tid::uuid AND tm.deleted_at IS NULL
                """, Map.of("phone", phone, "tid", tenantId.toString()));
    }

    /* ------------------------------------------------------------- members */

    public List<MemberView> members(UUID tenantId) {
        var s = CurrentScope.require();
        if (!s.isMemberOf(tenantId)) throw TenantRuleException.notAMember();

        // The client count is per COACH per WORKSPACE, which is the number an
        // admin is actually looking for and is not derivable from `trainer` —
        // the same coach may hold twelve clients here and four somewhere else.
        return jdbc.queryForList("""
                SELECT tm.id::text          AS member_id,
                       tm.app_user_id::text AS app_user_id,
                       t.id::text           AS trainer_id,
                       au.phone             AS phone,
                       COALESCE(t.name, au.phone) AS name,
                       tm.role              AS role,
                       tm.status            AS status,
                       tm.is_home           AS is_home,
                       tm.revenue_share_percent     AS revenue_share_percent,
                       tm.assignment_margin_percent AS assignment_margin_percent,
                       (SELECT COUNT(*) FROM client c
                         WHERE c.tenant_id = tm.tenant_id
                           AND c.trainer_id = t.id
                           AND c.deleted_at IS NULL) AS client_count
                FROM tenant_member tm
                JOIN app_user au ON au.id = tm.app_user_id
                LEFT JOIN trainer t ON t.phone = au.phone AND t.deleted_at IS NULL
                WHERE tm.tenant_id = :tid::uuid
                  AND tm.deleted_at IS NULL
                  AND tm.role <> 'client'
                ORDER BY tm.role, name
                """, Map.of("tid", tenantId.toString()))
                .stream()
                .map(r -> new MemberView(
                        (String) r.get("member_id"), (String) r.get("app_user_id"),
                        (String) r.get("trainer_id"), (String) r.get("phone"),
                        (String) r.get("name"), (String) r.get("role"),
                        (String) r.get("status"), Boolean.TRUE.equals(r.get("is_home")),
                        (BigDecimal) r.get("revenue_share_percent"),
                        (BigDecimal) r.get("assignment_margin_percent"),
                        ((Number) r.get("client_count")).intValue()))
                .toList();
    }

    /**
     * Set what a member keeps, and what an admin earns for placing a client.
     *
     * <p>Owner or admin only, and it changes the rate from NOW — every handover
     * already recorded keeps the margin frozen onto its
     * {@code client_assignment} row. That is the V11 argument again: an admin
     * who renegotiates in March must not silently restate what they earned in
     * January.
     */
    @Transactional
    public void updateShares(UUID tenantId, UUID memberId,
                             BigDecimal revenueShare, BigDecimal assignmentMargin) {
        requireAdmin(tenantId);
        var p = new MapSqlParameterSource()
                .addValue("id", memberId.toString())
                .addValue("tid", tenantId.toString())
                .addValue("share", revenueShare)
                .addValue("margin", assignmentMargin);
        // COALESCE so a PATCH that names one percentage cannot blank the other —
        // the same "null means leave it alone" contract /v1/trainers/me uses.
        int n = jdbc.update("""
                UPDATE tenant_member
                SET revenue_share_percent     = COALESCE(:share, revenue_share_percent),
                    assignment_margin_percent = COALESCE(:margin, assignment_margin_percent)
                WHERE id = :id::uuid AND tenant_id = :tid::uuid AND deleted_at IS NULL
                """, p);
        if (n == 0) throw TenantRuleException.notAMember();
    }

    @Transactional
    public void updateRole(UUID tenantId, UUID memberId, String role) {
        requireAdmin(tenantId);
        if (TenantRole.CLIENT.equals(role)) throw TenantRuleException.notACoachHere();
        int n = jdbc.update("""
                UPDATE tenant_member SET role = :role
                WHERE id = :id::uuid AND tenant_id = :tid::uuid
                  AND deleted_at IS NULL AND role <> 'owner'
                """, Map.of("id", memberId.toString(), "tid", tenantId.toString(), "role", role));
        if (n == 0) throw TenantRuleException.notAMember();
    }

    public UUID requireAdmin(UUID tenantId) {
        var s = CurrentScope.require();
        var membership = s.memberships().stream()
                .filter(m -> m.tenantId().equals(tenantId))
                .findFirst()
                .orElseThrow(TenantRuleException::notAMember);
        if (!TenantRole.administers(membership.role())) throw TenantRuleException.notAdmin();
        return tenantId;
    }

    /** Which app_user a phone is, creating nothing. */
    public UUID appUserIdFor(String phone) {
        var rows = jdbc.queryForList(
                "SELECT id::text AS id FROM app_user WHERE phone = :phone AND deleted_at IS NULL",
                Map.of("phone", phone));
        return rows.isEmpty() ? null : UUID.fromString((String) rows.getFirst().get("id"));
    }
}
