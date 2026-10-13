package com.inclineyou.inclineyou_backend.core.client;

import com.inclineyou.inclineyou_backend.core.client.dto.Message;
import com.inclineyou.inclineyou_backend.shared.wire.Cursor;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * The SQL on {@code client_message} and the one notice a message mints. No {@code tenant_id}: RLS scopes the reads and
 * {@code stamp_tenant_id} stamps the insert (TENANCY.md). A {@code DuplicateKeyException} is left to the caller, which knows
 * whether it was the recap's index or the id.
 */
@Repository
@RequiredArgsConstructor
public class ClientMessageJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /** What a message write decides on about the client. Empty when the client is not this trainer's, or is gone. */
    public record Target(String membershipStatus) {}

    /** One row of the list with its cursor key at full precision: {@code Message.at} is epoch ms and would skip rows in a lost fraction. */
    public record PageRow(Message message, String cursorKey) {}

    /** A message row as a replay or an edit finds it, deleted ones included. */
    public record Stored(Message message, UUID trainerId, UUID clientId, boolean deleted) {}

    private static final String COLUMNS = """
            m.id::text AS id, m.kind, m.body, m.session_id::text AS session_id, m.at, m.read_at, m.updated_at,
            m.trainer_id::text AS trainer_id, m.client_id::text AS client_id, m.deleted_at""";

    public Optional<Target> client(UUID trainerId, UUID clientId) {
        return jdbc.query("""
                SELECT membership_status FROM client
                WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL AND erased_at IS NULL
                """, Map.of("cid", clientId.toString(), "tid", trainerId.toString()),
                (rs, i) -> new Target(rs.getString("membership_status"))).stream().findFirst();
    }

    /** Whether the session is this client's own, which the composite foreign key also demands. */
    public boolean sessionIsTheirs(UUID clientId, UUID sessionId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM scheduled_session WHERE id = :sid::uuid AND client_id = :cid::uuid AND deleted_at IS NULL)
                """, Map.of("sid", sessionId.toString(), "cid", clientId.toString()), Boolean.class));
    }

    /** Whether the session already has a live recap, so the common case is answered without a unique-index failure. */
    public boolean recapExists(UUID sessionId) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM client_message WHERE session_id = :sid::uuid AND kind = 'recap' AND deleted_at IS NULL)",
                Map.of("sid", sessionId.toString()), Boolean.class));
    }

    /** By id alone, in any state: a replay of a create, an edit, and a repeat delete all start here. */
    public Optional<Stored> find(UUID messageId) {
        return jdbc.query("SELECT " + COLUMNS + " FROM client_message m WHERE m.id = :id::uuid",
                Map.of("id", messageId.toString()), (rs, i) -> new Stored(message(rs),
                        UUID.fromString(rs.getString("trainer_id")), UUID.fromString(rs.getString("client_id")),
                        rs.getTimestamp("deleted_at") != null)).stream().findFirst();
    }

    /** Locked, so an edit and the client opening it cannot both win. */
    public Optional<Stored> lock(UUID messageId) {
        return jdbc.query("SELECT " + COLUMNS + " FROM client_message m WHERE m.id = :id::uuid FOR UPDATE",
                Map.of("id", messageId.toString()), (rs, i) -> new Stored(message(rs),
                        UUID.fromString(rs.getString("trainer_id")), UUID.fromString(rs.getString("client_id")),
                        rs.getTimestamp("deleted_at") != null)).stream().findFirst();
    }

    public Message insert(UUID id, UUID trainerId, UUID clientId, UUID sessionId, String body, String kind) {
        var p = new HashMap<String, Object>();
        p.put("id", id.toString());
        p.put("tid", trainerId.toString());
        p.put("cid", clientId.toString());
        p.put("sid", sessionId == null ? null : sessionId.toString());
        p.put("body", body);
        p.put("kind", kind);
        return jdbc.queryForObject("""
                WITH m AS (
                    INSERT INTO client_message (id, trainer_id, client_id, session_id, body, kind)
                    VALUES (:id::uuid, :tid::uuid, :cid::uuid, CAST(:sid AS uuid), :body, :kind)
                    RETURNING *)
                SELECT\s""" + COLUMNS + " FROM m", p, (rs, i) -> message(rs));
    }

    public Message updateBody(UUID id, String body) {
        return jdbc.queryForObject("""
                WITH m AS (UPDATE client_message SET body = :body WHERE id = :id::uuid RETURNING *)
                SELECT\s""" + COLUMNS + " FROM m", Map.of("id", id.toString(), "body", body), (rs, i) -> message(rs));
    }

    public void softDelete(UUID id) {
        jdbc.update("UPDATE client_message SET deleted_at = now() WHERE id = :id::uuid AND deleted_at IS NULL",
                Map.of("id", id.toString()));
    }

    /** Newest first on {@code (at, id)}, over {@code idx_client_message_client}. */
    public List<PageRow> page(UUID trainerId, UUID clientId, Cursor after, int fetch) {
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("cid", clientId.toString());
        p.put("n", fetch);
        String keyset = "";
        if (after != null) {
            p.put("afterAt", after.keyAsTimestamp());
            p.put("afterId", after.id().toString());
            keyset = " AND (m.at, m.id) < (:afterAt, :afterId::uuid)";
        }
        return jdbc.query("SELECT " + COLUMNS
                + " FROM client_message m WHERE m.client_id = :cid::uuid AND m.trainer_id = :tid::uuid AND m.deleted_at IS NULL"
                + keyset + " ORDER BY m.at DESC, m.id DESC LIMIT :n", p,
                (rs, i) -> new PageRow(message(rs), Cursor.key(rs.getTimestamp("at"))));
    }

    private static Message message(ResultSet rs) throws SQLException {
        Timestamp read = rs.getTimestamp("read_at");
        return new Message(rs.getString("id"), rs.getString("kind"), rs.getString("body"), rs.getString("session_id"),
                rs.getTimestamp("at").getTime(), read == null ? null : read.getTime(),
                String.valueOf(rs.getTimestamp("updated_at").getTime()));
    }
}
