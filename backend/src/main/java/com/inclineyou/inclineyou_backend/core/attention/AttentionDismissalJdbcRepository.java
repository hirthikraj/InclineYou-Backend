package com.inclineyou.inclineyou_backend.core.attention;

import com.inclineyou.inclineyou_backend.core.attention.dto.DismissalResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * All SQL on {@code attention_dismissal}. The table has no soft delete (its key allows one silence per client per kind),
 * and what a band may be dismissed at is {@link AttentionDismissalService}'s rule, mirrored here only by the table's own
 * check constraint.
 */
@Repository
@RequiredArgsConstructor
public class AttentionDismissalJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    private static final RowMapper<DismissalResponse> ROW = (rs, i) -> {
        Timestamp until = rs.getTimestamp("snoozed_until");
        return new DismissalResponse(rs.getString("client_id"), rs.getString("kind"), rs.getString("band"),
                until == null ? null : until.getTime(), rs.getTimestamp("created_at").getTime());
    };

    private static final String COLUMNS = "client_id::text AS client_id, kind, band, snoozed_until, created_at";

    /** Every silence this trainer has, oldest first. Lapsed snoozes are included on purpose (see the service). */
    public List<DismissalResponse> list(UUID trainerId) {
        return jdbc.query("SELECT " + COLUMNS + " FROM attention_dismissal WHERE trainer_id = :tid::uuid "
                + "ORDER BY created_at, client_id, kind", Map.of("tid", trainerId.toString()), ROW);
    }

    /** 404-shaped when false: ownership is a query filter. */
    public boolean clientOnRoster(UUID trainerId, UUID clientId) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM client WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)",
                Map.of("cid", clientId.toString(), "tid", trainerId.toString()), Boolean.class));
    }

    /**
     * Upsert on the key (trainer_id, client_id, kind), answering the row as it now is. {@code created_at} is not
     * reassigned on conflict: it dates the first "not now". tenant_id is stamped by trg_attention_dismissal_stamp_tenant.
     */
    public DismissalResponse upsert(UUID trainerId, UUID clientId, String kind, String band, Long snoozedUntil) {
        var p = new MapSqlParameterSource("tid", trainerId.toString())
                .addValue("cid", clientId.toString())
                .addValue("kind", kind)
                .addValue("band", band)
                .addValue("until", snoozedUntil == null ? null : Timestamp.from(Instant.ofEpochMilli(snoozedUntil)));
        return jdbc.queryForObject("""
                INSERT INTO attention_dismissal (trainer_id, client_id, kind, band, snoozed_until)
                VALUES (:tid::uuid, :cid::uuid, :kind, :band, :until)
                ON CONFLICT (trainer_id, client_id, kind) DO UPDATE SET
                    band          = EXCLUDED.band,
                    snoozed_until = EXCLUDED.snoozed_until,
                    updated_at    = now()
                RETURNING """ + " " + COLUMNS, p, ROW);
    }

    /** Scoped by trainer_id in the WHERE clause, so another trainer's row is simply never matched. */
    public void delete(UUID trainerId, UUID clientId, String kind) {
        jdbc.update("DELETE FROM attention_dismissal WHERE trainer_id = :tid::uuid AND client_id = :cid::uuid AND kind = :kind",
                Map.of("tid", trainerId.toString(), "cid", clientId.toString(), "kind", kind));
    }
}
