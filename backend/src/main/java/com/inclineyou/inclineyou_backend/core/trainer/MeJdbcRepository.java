package com.inclineyou.inclineyou_backend.core.trainer;

import com.inclineyou.inclineyou_backend.core.tenant.dto.Workspace;
import com.inclineyou.inclineyou_backend.core.trainer.dto.GymPlaceView;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.util.Optional;
import java.util.UUID;

/**
 * The one statement behind {@code GET /v1/me}.
 *
 * <p>One query rather than five lookups because this is the read every screen's shell makes: it used to
 * be the trainer, the app user, the business row, the gym place and the tenant read one at a time, with
 * no transaction, so each borrowed a connection of its own and paid {@code TenantAwareDataSource}'s
 * {@code set_config} round trip again — about ten round trips for five rows. The policies apply to the
 * join exactly as they did to the separate reads; it runs on the same role.
 */
@Repository
@RequiredArgsConstructor
public class MeJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /**
     * The trainer's shell row, or empty when there is no live trainer for this id — a closed account
     * (either {@code trainer} or its {@code app_user} carries {@code deleted_at}) answers the same as a
     * missing one. {@code workspace} is null when {@code tenantId} is null or its row is not there.
     */
    public Optional<MeRow> find(UUID trainerId, UUID tenantId) {
        return jdbc.query("""
                SELECT t.id::text AS id, t.name, u.phone, t.setup_completed_at,
                       b.gym_name,
                       g.id::text AS g_id, g.place_id AS g_place_id, g.name AS g_name,
                       g.address AS g_address, g.city AS g_city, g.map_link AS g_map_link,
                       w.id::text AS w_id, w.name AS w_name, w.currency AS w_currency,
                       w.country AS w_country, w.timezone AS w_timezone
                FROM trainer t
                JOIN app_user u           ON u.id = t.app_user_id AND u.deleted_at IS NULL
                LEFT JOIN trainer_business b ON b.trainer_id = t.id
                LEFT JOIN gym_place g     ON g.id = b.gym_place_id
                LEFT JOIN tenant w        ON w.id = :tenantId::uuid
                WHERE t.id = :trainerId::uuid AND t.deleted_at IS NULL
                """, new MapSqlParameterSource("trainerId", trainerId.toString())
                        .addValue("tenantId", tenantId == null ? null : tenantId.toString()), (rs, i) -> {
            Timestamp setup = rs.getTimestamp("setup_completed_at");
            String gymPlaceId = rs.getString("g_id");
            String workspaceId = rs.getString("w_id");
            return new MeRow(
                    rs.getString("id"), rs.getString("name"), rs.getString("phone"),
                    setup == null ? null : setup.toInstant().toEpochMilli(),
                    rs.getString("gym_name"),
                    workspaceId == null ? null : new Workspace(workspaceId, rs.getString("w_name"),
                            rs.getString("w_currency"), rs.getString("w_country"), rs.getString("w_timezone")),
                    gymPlaceId == null ? null : new GymPlaceView(gymPlaceId, rs.getString("g_place_id"),
                            rs.getString("g_name"), rs.getString("g_address"), rs.getString("g_city"),
                            rs.getString("g_map_link")));
        }).stream().findFirst();
    }

    public record MeRow(String id, String name, String phone, Long setupCompletedAt, String gymName,
                        Workspace workspace, GymPlaceView gymPlace) {}
}
