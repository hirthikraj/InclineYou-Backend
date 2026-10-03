package com.inclineyou.inclineyou_backend.core.client;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.UUID;

/**
 * The one read behind {@link ClientPhoneGuard}: where a phone number already sits — as the caller's own sign-in, on their
 * own roster, or on another coach's roster in the same workspace. What each answer MEANS (the codes, the sentences) is the
 * guard's.
 */
@Repository
@RequiredArgsConstructor
public class ClientPhoneJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /**
     * @param isSelf        the number is the caller's own trainer account
     * @param onOtherRoster another coach's live client in this workspace has it
     * @param ownClientId   the caller's own client with the number, or null; {@code ownClientName} and
     *                      {@code ownClientStatus} ride with it
     */
    public record Standing(boolean isSelf, boolean onOtherRoster, String ownClientId, String ownClientName,
                           String ownClientStatus) {}

    /**
     * @param tenantId        the workspace the caller is standing in; null means no workspace predicate, which is exactly
     *                        the strict behaviour the guard had before tenancy
     * @param includeArchived whether the caller's own archived clients count (the phone-check asks, so the add flow can
     *                        offer a restore; a write does not, because uq_client_phone_live lets a new client take an
     *                        archived one's number)
     */
    public Standing standing(String phone, UUID trainerId, UUID tenantId, boolean includeArchived) {
        var p = new MapSqlParameterSource("phone", phone)
                .addValue("tid", trainerId.toString())
                // A null tenant is a meaningful value here, hence a parameter source and not Map.of.
                .addValue("tenantId", tenantId == null ? null : tenantId.toString())
                .addValue("archived", includeArchived);
        return jdbc.queryForObject("""
                SELECT
                    EXISTS(
                        SELECT 1 FROM trainer t JOIN app_user au ON au.id = t.app_user_id
                        WHERE au.phone = :phone AND t.id = :tid::uuid AND t.deleted_at IS NULL
                    ) AS is_self,
                    EXISTS(
                        SELECT 1 FROM client
                        WHERE phone = :phone
                          AND trainer_id <> :tid::uuid
                          -- Scoped to ONE workspace, which is the change tenancy
                          -- made. The old query had no tenant predicate and
                          -- therefore refused a number that was on any roster in
                          -- the product; that made "a client can train under two
                          -- arrangements" impossible to express.
                          AND (:tenantId::uuid IS NULL OR tenant_id = :tenantId::uuid)
                          AND deleted_at IS NULL
                          AND status <> 'archived'
                          AND membership_status NOT IN ('removed', 'declined')
                    ) AS on_other_roster,
                    own.id::text AS own_client_id, own.name AS own_client_name, own.status AS own_client_status
                FROM (SELECT 1) one
                LEFT JOIN LATERAL (
                        SELECT id, name, status FROM client
                        WHERE phone = :phone
                          AND trainer_id = :tid::uuid
                          AND (:tenantId::uuid IS NULL OR tenant_id = :tenantId::uuid)
                          AND deleted_at IS NULL
                          AND (:archived OR (status <> 'archived'
                               AND membership_status NOT IN ('removed', 'declined')))
                        -- A live client before an archived one with the same number.
                        ORDER BY (status = 'archived'), created_at
                        LIMIT 1
                ) own ON true
                """, p, (rs, i) -> new Standing(rs.getBoolean("is_self"), rs.getBoolean("on_other_roster"),
                rs.getString("own_client_id"), rs.getString("own_client_name"), rs.getString("own_client_status")));
    }
}
