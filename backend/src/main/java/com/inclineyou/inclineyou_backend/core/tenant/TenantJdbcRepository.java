package com.inclineyou.inclineyou_backend.core.tenant;

import com.inclineyou.inclineyou_backend.core.tenant.dto.Workspace;
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
     */
    public List<TenantScope.Membership> memberships(String phone) {
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
                rs.getBoolean("is_home")));
    }

    /** {@code trainer.home_tenant_id}, or empty for no row or no home. */
    public Optional<UUID> homeTenantOf(UUID trainerId) {
        return jdbc.queryForList("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid",
                        Map.of("id", trainerId.toString()), String.class)
                .stream().filter(java.util.Objects::nonNull).findFirst().map(UUID::fromString);
    }

}
