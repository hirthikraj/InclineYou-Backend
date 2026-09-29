package com.inclineyou.inclineyou_backend.core.tenant;

import com.inclineyou.inclineyou_backend.core.tenant.dto.MemberView;
import com.inclineyou.inclineyou_backend.core.tenant.dto.Workspace;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * The SQL on {@code tenant} and {@code tenant_member}, and the lookups
 * {@link TenantScope} resolves on every request. Handover and revenue SQL are
 * {@link ClientHandoverJdbcRepository}'s and {@link TenantRevenueJdbcRepository}'s.
 */
@Repository
@RequiredArgsConstructor
public class TenantJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    // ── the workspace itself ───────────────────────────────────────────────────

    /** {@code tenant.timezone}. Throws when the row is missing, as it always did. */
    public String timezone(UUID tenantId) {
        return jdbc.queryForObject("SELECT timezone FROM tenant WHERE id = :id::uuid",
                Map.of("id", tenantId.toString()), String.class);
    }

    /** The workspace banner {@code /v1/me} draws. */
    public Optional<Workspace> workspace(UUID tenantId) {
        return jdbc.query("""
                SELECT id::text AS id, name, currency, country, timezone
                FROM tenant WHERE id = :id::uuid
                """, Map.of("id", tenantId.toString()), (rs, i) -> new Workspace(
                rs.getString("id"), rs.getString("name"), rs.getString("currency"),
                rs.getString("country"), rs.getString("timezone"))).stream().findFirst();
    }

    // ── scope resolution (every request) ───────────────────────────────────────

    /**
     * Every live membership for a number.
     *
     * <p>Reads through the bootstrap policy in V42 — keyed on {@code app.phone},
     * SELECT only — which is what lets this query run before a workspace is
     * known. It is the only query in the product that is allowed to.
     *
     * <p>{@code revenue_share_percent} / {@code assignment_margin_percent} are read
     * as literal NULLs: they are Ring-2 gym-platform columns that never made it
     * into the 25 Sep 2026 rebuild's 41 tables. Every membership answers "no
     * split" until that migration lands, rather than this query failing on every
     * request.
     */
    public List<TenantScope.Membership> memberships(String phone) {
        return jdbc.query("""
                SELECT tm.id::text            AS member_id,
                       tm.tenant_id::text     AS tenant_id,
                       t.name                 AS tenant_name,
                       t.type                 AS tenant_type,
                       tm.role                AS role,
                       tm.is_home             AS is_home,
                       NULL::numeric          AS revenue_share_percent,
                       NULL::numeric          AS assignment_margin_percent
                FROM tenant_member tm
                JOIN tenant   t  ON t.id = tm.tenant_id
                JOIN app_user au ON au.id = tm.app_user_id
                WHERE au.phone = :phone
                  AND au.deleted_at IS NULL
                  AND tm.deleted_at IS NULL
                  AND tm.status = 'active'
                  AND tm.role <> 'client'
                  AND t.status = 'active'
                ORDER BY tm.is_home DESC, t.name
                """, Map.of("phone", phone), (rs, i) -> new TenantScope.Membership(
                UUID.fromString(rs.getString("member_id")),
                UUID.fromString(rs.getString("tenant_id")),
                rs.getString("tenant_name"),
                rs.getString("tenant_type"),
                rs.getString("role"),
                rs.getBoolean("is_home"),
                rs.getBigDecimal("revenue_share_percent"),
                rs.getBigDecimal("assignment_margin_percent")));
    }

    /** {@code trainer.home_tenant_id}, or empty for no row or no home. */
    public Optional<UUID> homeTenantOf(UUID trainerId) {
        return jdbc.queryForList("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid",
                        Map.of("id", trainerId.toString()), String.class)
                .stream().filter(java.util.Objects::nonNull).findFirst().map(UUID::fromString);
    }

    /** The client rows behind a phone — the client lens, plural by requirement. */
    public List<UUID> clientIdsFor(String phone) {
        return uuids("""
                SELECT id::text FROM client
                WHERE phone = :phone
                  AND deleted_at IS NULL
                  AND membership_status NOT IN ('declined')
                """, phone);
    }

    /** The workspaces those client rows are coached in. */
    public List<UUID> clientTenantIdsFor(String phone) {
        return uuids("""
                SELECT DISTINCT tenant_id::text FROM client
                WHERE phone = :phone
                  AND deleted_at IS NULL
                  AND membership_status NOT IN ('declined')
                """, phone);
    }

    /** Which app_user a phone is, creating nothing. */
    public Optional<UUID> appUserIdFor(String phone) {
        return uuids("SELECT id::text FROM app_user WHERE phone = :phone AND deleted_at IS NULL", phone)
                .stream().findFirst();
    }

    // ── members ────────────────────────────────────────────────────────────────

    /** Move the home flag: off every membership of this number, then onto one. */
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

    /**
     * The client count is per COACH per WORKSPACE, which is the number an admin
     * is actually looking for and is not derivable from {@code trainer} — the
     * same coach may hold twelve clients here and four somewhere else.
     *
     * <p>ponytail: still on the pre-25-Sep schema ({@code trainer.phone},
     * {@code tenant_member.revenue_share_percent} are gone), so this fails until
     * the tenant SQL is adapted to v1 — moved here unchanged.
     */
    public List<MemberView> members(UUID tenantId) {
        return jdbc.query("""
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
                """, Map.of("tid", tenantId.toString()), (rs, i) -> new MemberView(
                rs.getString("member_id"), rs.getString("app_user_id"),
                rs.getString("trainer_id"), rs.getString("phone"),
                rs.getString("name"), rs.getString("role"),
                rs.getString("status"), rs.getBoolean("is_home"),
                rs.getBigDecimal("revenue_share_percent"),
                rs.getBigDecimal("assignment_margin_percent"),
                rs.getInt("client_count")));
    }

    /**
     * COALESCE so a PATCH that names one percentage cannot blank the other.
     * Returns the rows changed — 0 when the member is not in this workspace.
     *
     * <p>ponytail: the two columns are not in the v1 schema (see {@link #members}).
     */
    public int updateShares(UUID tenantId, UUID memberId, BigDecimal revenueShare, BigDecimal assignmentMargin) {
        return jdbc.update("""
                UPDATE tenant_member
                SET revenue_share_percent     = COALESCE(:share, revenue_share_percent),
                    assignment_margin_percent = COALESCE(:margin, assignment_margin_percent)
                WHERE id = :id::uuid AND tenant_id = :tid::uuid AND deleted_at IS NULL
                """, new MapSqlParameterSource()
                .addValue("id", memberId.toString())
                .addValue("tid", tenantId.toString())
                .addValue("share", revenueShare)
                .addValue("margin", assignmentMargin));
    }

    /** Never the owner's row. Returns the rows changed. */
    public int updateRole(UUID tenantId, UUID memberId, String role) {
        return jdbc.update("""
                UPDATE tenant_member SET role = :role
                WHERE id = :id::uuid AND tenant_id = :tid::uuid
                  AND deleted_at IS NULL AND role <> 'owner'
                """, Map.of("id", memberId.toString(), "tid", tenantId.toString(), "role", role));
    }

    private List<UUID> uuids(String sql, String phone) {
        return jdbc.queryForList(sql, Map.of("phone", phone), String.class).stream().map(UUID::fromString).toList();
    }
}
