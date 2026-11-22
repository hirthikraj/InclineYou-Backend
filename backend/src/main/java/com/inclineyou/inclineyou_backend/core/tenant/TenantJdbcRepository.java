package com.inclineyou.inclineyou_backend.core.tenant;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * The SQL on {@code tenant} and {@code tenant_member}, and the lookups
 * {@link TenantScope} resolves on every request.
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

    /** {@code tenant.currency} — every money response states it. */
    public String currency(UUID tenantId) {
        return jdbc.queryForObject("SELECT currency FROM tenant WHERE id = :id::uuid",
                Map.of("id", tenantId.toString()), String.class);
    }

    // ── scope resolution (every request) ───────────────────────────────────────

    /**
     * Every live membership for a number.
     *
     * <p>Reads through the bootstrap policy in V42 — keyed on {@code app.phone},
     * SELECT only — which is what lets this query run before a workspace is
     * known. It is the only query in the product that is allowed to.
     */
    public List<TenantScope.Membership> memberships(String phone, UUID trainerId) {
        var p = new java.util.HashMap<String, Object>();
        p.put("phone", phone);
        p.put("tid", trainerId == null ? null : trainerId.toString());
        return jdbc.query("""
                SELECT tm.id::text            AS member_id,
                       tm.tenant_id::text     AS tenant_id,
                       t.name                 AS tenant_name,
                       t.type                 AS tenant_type,
                       tm.role                AS role,
                       tm.is_home             AS is_home
                FROM tenant_member tm
                JOIN tenant   t  ON t.id = tm.tenant_id
                JOIN app_user au ON au.id = tm.app_user_id
                WHERE au.phone = :phone
                  -- A trainer's credential matches only that trainer's own account (20 Nov 2026). A credential minted before a
                  -- number change still carries the old number, and once somebody signed up on it the phone alone found the
                  -- NEWCOMER's memberships, so that session's workspace became a stranger's. With the trainer pinned, a stale
                  -- number matches nothing and TenantScope falls back to the trainer's own home (homeTenantOf).
                  AND (CAST(:tid AS uuid) IS NULL OR au.id = (SELECT tr.app_user_id FROM trainer tr WHERE tr.id = CAST(:tid AS uuid)))
                  AND au.deleted_at IS NULL
                  AND tm.deleted_at IS NULL
                  AND tm.status = 'active'
                  AND tm.role <> 'client'
                  AND t.status = 'active'
                ORDER BY tm.is_home DESC, t.name
                """, p, (rs, i) -> new TenantScope.Membership(
                UUID.fromString(rs.getString("member_id")),
                UUID.fromString(rs.getString("tenant_id")),
                rs.getString("tenant_name"),
                rs.getString("tenant_type"),
                rs.getString("role"),
                rs.getBoolean("is_home")));
    }

    /** {@code trainer.home_tenant_id}, or empty for no row or no home. */
    public Optional<UUID> homeTenantOf(UUID trainerId) {
        // A closed trainer has no workspace (20 Nov 2026): a phone app's JWT outlives the close (only web sessions are
        // revoked), and this fallback used to hand it the trainer's books for up to seven days. Now it finds none and the
        // request reads nothing (AuthTokenFilter: "no workspace — request will read nothing").
        return jdbc.queryForList("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid AND deleted_at IS NULL",
                        Map.of("id", trainerId.toString()), String.class)
                .stream().filter(java.util.Objects::nonNull).findFirst().map(UUID::fromString);
    }

}
