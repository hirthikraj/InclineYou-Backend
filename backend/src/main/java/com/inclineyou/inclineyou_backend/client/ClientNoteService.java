package com.inclineyou.inclineyou_backend.client;

import com.inclineyou.inclineyou_backend.exception.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * api-contract 1.1 Client file — the trainer's notes: list, add, edit or pin,
 * delete, restore.
 *
 * <p>Free text and a pin, and that is the whole shape. There is no injury,
 * condition or PAR-Q field, and there must never be one: a field that tells a
 * medical note apart from any other makes this a health record under the DPDP
 * Act, whatever it is called. Notes shared with the client are out of v1, so
 * {@code sharedWithClient} is refused.
 *
 * <p>A deleted note comes back through {@code …/restore}, never by re-POSTing its
 * id: a create that silently undeletes is a surprise.
 */
@Service
@RequiredArgsConstructor
public class ClientNoteService {

    private final NamedParameterJdbcTemplate jdbc;
    private final ClientFileService files;

    public record Note(String id, String body, boolean pinned, long createdAt, long updatedAt, String version) {}

    public record Created(Note note, boolean created) {}

    private static final String COLUMNS = "id::text AS id, body, pinned, created_at, updated_at";

    /** Pinned first, then newest, in one read of idx_client_note_list. */
    public List<Note> list(UUID tid, UUID cid) {
        files.requireOwned(tid, cid);
        return jdbc.query("SELECT " + COLUMNS + """
                 FROM client_note
                WHERE client_id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                ORDER BY pinned DESC, created_at DESC, id
                """, Map.of("cid", cid.toString(), "tid", tid.toString()), ClientNoteService::row);
    }

    @Transactional
    public Created create(UUID tid, UUID cid, Map<String, Object> body) {
        var b = keys(body, true);
        String text = body(b.get("body"));
        boolean pinned = pinned(b.get("pinned"));
        UUID id = ClientWriteService.uuid(b.get("id"), "id");
        files.requireOwned(tid, cid);
        var p = new HashMap<String, Object>();
        p.put("tid", tid.toString());
        p.put("cid", cid.toString());
        if (id != null) {
            p.put("id", id.toString());
            var owner = jdbc.queryForList("""
                    SELECT (trainer_id = :tid::uuid AND client_id = :cid::uuid AND deleted_at IS NULL) AS mine
                    FROM client_note WHERE id = :id::uuid""", p);
            if (!owner.isEmpty()) {
                if (!Boolean.TRUE.equals(owner.getFirst().get("mine"))) throw ApiException.idConflict();
                return new Created(one(id), false);
            }
        }
        p.put("id", (id == null ? UUID.randomUUID() : id).toString());
        p.put("body", text);
        p.put("pinned", pinned);
        int inserted = jdbc.update("""
                INSERT INTO client_note (id, client_id, trainer_id, body, pinned)
                VALUES (:id::uuid, :cid::uuid, :tid::uuid, :body, :pinned)
                ON CONFLICT (id) DO NOTHING""", p);
        if (inserted == 0) throw ApiException.idConflict();
        return new Created(one(UUID.fromString((String) p.get("id"))), true);
    }

    /** Send only what changed — {@code body}, {@code pinned}, or both. If-Match honoured when sent. */
    @Transactional
    public Note patch(UUID tid, UUID cid, UUID noteId, String ifMatch, Map<String, Object> body) {
        var b = keys(body, false);
        if (b.isEmpty()) throw ApiException.validation("body: send body or pinned");
        var p = new HashMap<String, Object>();
        p.put("nid", noteId.toString());
        var current = lock(tid, cid, noteId);
        if (current.get("deleted_at") != null) throw ApiException.notFound("That note was deleted.");
        String version = String.valueOf(((java.sql.Timestamp) current.get("updated_at")).getTime());
        if (ifMatch != null && !ifMatch.isBlank() && !"*".equals(ifMatch.strip())
                && !ifMatch.strip().replaceFirst("^W/", "").replace("\"", "").equals(version)) {
            throw new ApiException(HttpStatus.PRECONDITION_FAILED, "PRECONDITION_FAILED",
                    "This note changed since you opened it.");
        }
        var sets = new StringBuilder();
        if (b.containsKey("body")) { p.put("body", body(b.get("body"))); sets.append(", body = :body"); }
        if (b.containsKey("pinned")) { p.put("pinned", pinned(b.get("pinned"))); sets.append(", pinned = :pinned"); }
        jdbc.update("UPDATE client_note SET " + sets.substring(2) + " WHERE id = :nid::uuid", p);
        return one(noteId);
    }

    /** Soft, and idempotent: a deleted note answers 204 again. */
    @Transactional
    public void delete(UUID tid, UUID cid, UUID noteId) {
        lock(tid, cid, noteId);
        jdbc.update("UPDATE client_note SET deleted_at = now() WHERE id = :nid::uuid AND deleted_at IS NULL",
                Map.of("nid", noteId.toString()));
    }

    /** The delete toast's Undo. A note that isn't deleted answers as it is. */
    @Transactional
    public Note restore(UUID tid, UUID cid, UUID noteId) {
        lock(tid, cid, noteId);
        jdbc.update("UPDATE client_note SET deleted_at = NULL WHERE id = :nid::uuid AND deleted_at IS NOT NULL",
                Map.of("nid", noteId.toString()));
        return one(noteId);
    }

    private Map<String, Object> lock(UUID tid, UUID cid, UUID noteId) {
        var rows = jdbc.queryForList("""
                SELECT updated_at, deleted_at FROM client_note
                WHERE id = :nid::uuid AND client_id = :cid::uuid AND trainer_id = :tid::uuid FOR UPDATE
                """, Map.of("nid", noteId.toString(), "cid", cid.toString(), "tid", tid.toString()));
        if (rows.isEmpty()) throw ApiException.notFound("That note is not on this client.");
        return rows.getFirst();
    }

    private Note one(UUID noteId) {
        return jdbc.queryForObject("SELECT " + COLUMNS + " FROM client_note WHERE id = :nid::uuid",
                Map.of("nid", noteId.toString()), ClientNoteService::row);
    }

    private static Map<String, Object> keys(Map<String, Object> body, boolean create) {
        if (body == null) throw ApiException.validation("body: required");
        for (String key : body.keySet()) {
            if ("sharedWithClient".equals(key)) throw ApiException.validation("sharedWithClient: notes shared with the client are not in v1");
            if (!("body".equals(key) || "pinned".equals(key) || create && "id".equals(key))) {
                throw ClientWriteService.unknown(key);
            }
        }
        return body;
    }

    /** client_note_body: not blank, at most 4,000 characters. */
    private static String body(Object raw) {
        if (!(raw instanceof String s) || s.isBlank()) throw ApiException.validation("body: required");
        if (s.length() > 4000) throw ApiException.validation("body: at most 4,000 characters");
        return s;
    }

    private static boolean pinned(Object raw) {
        if (raw == null) return false;
        if (!(raw instanceof Boolean b)) throw ApiException.validation("pinned: true or false");
        return b;
    }

    private static Note row(ResultSet rs, int i) throws SQLException {
        long updated = rs.getTimestamp("updated_at").getTime();
        return new Note(rs.getString("id"), rs.getString("body"), rs.getBoolean("pinned"),
                rs.getTimestamp("created_at").getTime(), updated, String.valueOf(updated));
    }
}
