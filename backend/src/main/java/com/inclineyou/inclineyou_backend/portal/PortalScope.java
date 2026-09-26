package com.inclineyou.inclineyou_backend.portal;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

/**
 * WHICH ROSTER IS THIS REQUEST ABOUT — resolved once per portal request.
 *
 * <p>A client token's subject is a PHONE, and one phone can be a client of two
 * trainers (two `client` rows, possibly in two workspaces, V37). The web sends
 * `?clientId=` from its roster cookie when there is more than one, and sends
 * nothing for a single-roster client — so:
 * <ul>
 *   <li>no live row for this phone → {@code 403 NOT_A_CLIENT};</li>
 *   <li>a {@code clientId} that is not one of this phone's rows → {@code 403
 *       NOT_YOURS} (the same answer whether the id exists or not);</li>
 *   <li>no {@code clientId} → the single row, or else the most recently ACCEPTED
 *       one (then the newest, then the id) — a total order, never "the first row",
 *       because an ORDER BY with ties returns any of them.</li>
 * </ul>
 *
 * <p>The row must be live, its trainer live, and its membership not
 * {@code declined} — the same set {@code TenantScope.clientIdsFor} puts in
 * {@code app.client_ids}, so the tier-4 policies and this resolver agree on who
 * the caller is. {@code tenantId} is carried because every client WRITE must set
 * {@code tenant_id} from the resolved row: {@code stamp_tenant_id()} would take
 * the first of possibly several workspaces.
 */
@Component
@RequiredArgsConstructor
public class PortalScope {

    private final NamedParameterJdbcTemplate jdbc;

    public record Me(UUID clientId, UUID trainerId, UUID tenantId, String phone) {}

    public Me resolve(String phone, String clientId) {
        var rows = jdbc.queryForList("""
                SELECT c.id::text AS cid, c.trainer_id::text AS tid, c.tenant_id::text AS tenant
                FROM client c JOIN trainer t ON t.id = c.trainer_id
                WHERE c.phone = :phone AND c.deleted_at IS NULL AND t.deleted_at IS NULL
                  AND c.membership_status NOT IN ('declined')
                ORDER BY c.accepted_at DESC NULLS LAST, c.created_at DESC, c.id
                """, Map.of("phone", phone == null ? "" : phone));
        if (rows.isEmpty()) throw PortalRuleException.notAClient();

        Map<String, Object> row = rows.getFirst();
        if (clientId != null && !clientId.isBlank()) {
            row = rows.stream().filter(r -> r.get("cid").equals(clientId.strip())).findFirst()
                    .orElseThrow(PortalRuleException::notYours);
        }
        return new Me(UUID.fromString((String) row.get("cid")), UUID.fromString((String) row.get("tid")),
                row.get("tenant") == null ? null : UUID.fromString((String) row.get("tenant")), phone);
    }
}
