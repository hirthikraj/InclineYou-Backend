package com.inclineyou.inclineyou_backend.core.client;

import com.inclineyou.inclineyou_backend.core.client.dto.LeadContact;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static com.inclineyou.inclineyou_backend.core.client.ClientJdbcRepository.params;

/** The SQL on {@code lead_contact} (V48). No {@code tenant_id}: RLS scopes it and {@code stamp_tenant_id} stamps it. */
@Repository
@RequiredArgsConstructor
public class LeadContactJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /** A contact locked for the Undo: whether it is gone already, the dates it moved, and whether it is the newest. */
    public record Locked(boolean deleted, LocalDate followUpOn, LocalDate previousFollowUpOn, boolean newest) {}

    private static final String COLUMNS =
            "id::text AS id, channel, outcome, note, follow_up_on::text AS follow_up_on, created_at";

    /** Newest first. Bounded: a lead with two hundred contacts is not a lead any more. */
    public List<LeadContact> list(UUID trainerId, UUID clientId) {
        return jdbc.query("SELECT " + COLUMNS + """
                 FROM lead_contact
                WHERE client_id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                ORDER BY created_at DESC, id DESC
                LIMIT 200
                """, params(trainerId, clientId), LeadContactJdbcRepository::row);
    }

    /** Whether this id is this trainer's contact on this client (deleted or not) — empty when no contact has the id. */
    public Optional<Boolean> isMine(UUID id, UUID trainerId, UUID clientId) {
        var p = params(trainerId, clientId);
        p.put("id", id.toString());
        return jdbc.queryForList("""
                SELECT (trainer_id = :tid::uuid AND client_id = :cid::uuid) AS mine FROM lead_contact WHERE id = :id::uuid
                """, p, Boolean.class).stream().findFirst();
    }

    /**
     * False when the id was taken meanwhile. {@code clock_timestamp()}, not the column's {@code now()}: "newest" orders by
     * it, and two contacts written in one transaction would otherwise tie and fall back to the order of random ids.
     */
    public boolean insert(UUID id, UUID trainerId, UUID clientId, String channel, String outcome, String note,
                          LocalDate followUpOn, LocalDate previousFollowUpOn) {
        var p = params(trainerId, clientId);
        p.put("id", id.toString());
        p.put("channel", channel);
        p.put("outcome", outcome);
        p.put("note", note);
        p.put("on", followUpOn == null ? null : Date.valueOf(followUpOn));
        p.put("prev", previousFollowUpOn == null ? null : Date.valueOf(previousFollowUpOn));
        return jdbc.update("""
                INSERT INTO lead_contact (id, client_id, trainer_id, channel, outcome, note, follow_up_on, previous_follow_up_on,
                                          created_at)
                VALUES (:id::uuid, :cid::uuid, :tid::uuid, :channel, :outcome, :note, :on, :prev, clock_timestamp())
                ON CONFLICT (id) DO NOTHING""", p) > 0;
    }

    public LeadContact one(UUID id) {
        return jdbc.queryForObject("SELECT " + COLUMNS + " FROM lead_contact WHERE id = :id::uuid",
                Map.of("id", id.toString()), LeadContactJdbcRepository::row);
    }

    public Optional<Locked> lock(UUID trainerId, UUID clientId, UUID id) {
        var p = params(trainerId, clientId);
        p.put("id", id.toString());
        return jdbc.query("""
                SELECT x.deleted_at IS NOT NULL AS deleted, x.follow_up_on, x.previous_follow_up_on,
                       NOT EXISTS (SELECT 1 FROM lead_contact y
                                   WHERE y.client_id = x.client_id AND y.deleted_at IS NULL AND y.id <> x.id
                                     AND (y.created_at, y.id) > (x.created_at, x.id)) AS newest
                FROM lead_contact x
                WHERE x.id = :id::uuid AND x.client_id = :cid::uuid AND x.trainer_id = :tid::uuid
                FOR UPDATE OF x
                """, p, (rs, i) -> new Locked(rs.getBoolean("deleted"), rs.getObject("follow_up_on", LocalDate.class),
                rs.getObject("previous_follow_up_on", LocalDate.class), rs.getBoolean("newest"))).stream().findFirst();
    }

    public void softDelete(UUID id) {
        jdbc.update("UPDATE lead_contact SET deleted_at = now() WHERE id = :id::uuid AND deleted_at IS NULL",
                Map.of("id", id.toString()));
    }

    private static LeadContact row(ResultSet rs, int i) throws SQLException {
        return new LeadContact(rs.getString("id"), rs.getString("channel"), rs.getString("outcome"), rs.getString("note"),
                rs.getString("follow_up_on"), rs.getTimestamp("created_at").getTime());
    }
}
