package com.inclineyou.inclineyou_backend.core.client;

import com.inclineyou.inclineyou_backend.core.client.dto.ClientDetail;
import com.inclineyou.inclineyou_backend.core.client.dto.Note;
import com.inclineyou.inclineyou_backend.core.client.dto.UpdateNoteRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static com.inclineyou.inclineyou_backend.core.client.ClientJdbcRepository.params;

/** The SQL on {@code client_note}. */
@Repository
@RequiredArgsConstructor
public class ClientNoteJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /** A note locked for a write. */
    public record LockedNote(String version, boolean deleted) {}

    private static final String COLUMNS = "id::text AS id, body, pinned, created_at, updated_at";

    /** Pinned first, then newest, in one read of idx_client_note_list. */
    public List<Note> list(UUID trainerId, UUID clientId) {
        return jdbc.query("SELECT " + COLUMNS + """
                 FROM client_note
                WHERE client_id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                ORDER BY pinned DESC, created_at DESC, id
                """, params(trainerId, clientId), ClientNoteJdbcRepository::row);
    }

    /**
     * Whether a note with this id is this trainer's live note on this client —
     * empty when no note has the id at all.
     */
    public Optional<Boolean> isMine(UUID noteId, UUID trainerId, UUID clientId) {
        var p = params(trainerId, clientId);
        p.put("id", noteId.toString());
        return jdbc.queryForList("""
                SELECT (trainer_id = :tid::uuid AND client_id = :cid::uuid AND deleted_at IS NULL) AS mine
                FROM client_note WHERE id = :id::uuid""", p, Boolean.class).stream().findFirst();
    }

    /** False when the id was taken meanwhile. */
    public boolean insert(UUID noteId, UUID trainerId, UUID clientId, String body, boolean pinned) {
        var p = params(trainerId, clientId);
        p.put("id", noteId.toString());
        p.put("body", body);
        p.put("pinned", pinned);
        return jdbc.update("""
                INSERT INTO client_note (id, client_id, trainer_id, body, pinned)
                VALUES (:id::uuid, :cid::uuid, :tid::uuid, :body, :pinned)
                ON CONFLICT (id) DO NOTHING""", p) > 0;
    }

    public Optional<LockedNote> lock(UUID trainerId, UUID clientId, UUID noteId) {
        var p = params(trainerId, clientId);
        p.put("nid", noteId.toString());
        return jdbc.query("""
                SELECT updated_at, deleted_at FROM client_note
                WHERE id = :nid::uuid AND client_id = :cid::uuid AND trainer_id = :tid::uuid FOR UPDATE
                """, p, (rs, i) -> new LockedNote(String.valueOf(rs.getTimestamp("updated_at").getTime()),
                rs.getTimestamp("deleted_at") != null)).stream().findFirst();
    }

    /** Only the fields that were sent; the caller has refused an empty patch. */
    public void update(UUID noteId, UpdateNoteRequest req) {
        var p = new HashMap<String, Object>();
        p.put("nid", noteId.toString());
        var sets = new StringBuilder();
        if (req.body() != null) { p.put("body", req.body().value()); sets.append(", body = :body"); }
        if (req.pinned() != null) { p.put("pinned", req.pinned().value()); sets.append(", pinned = :pinned"); }
        jdbc.update("UPDATE client_note SET " + sets.substring(2) + " WHERE id = :nid::uuid", p);
    }

    public void softDelete(UUID noteId) {
        jdbc.update("UPDATE client_note SET deleted_at = now() WHERE id = :nid::uuid AND deleted_at IS NULL",
                Map.of("nid", noteId.toString()));
    }

    public void restore(UUID noteId) {
        jdbc.update("UPDATE client_note SET deleted_at = NULL WHERE id = :nid::uuid AND deleted_at IS NOT NULL",
                Map.of("nid", noteId.toString()));
    }

    /** Every live note on a deleted client — the trainer's own call, unlike the client's own {@code DELETE /v1/me}, which keeps them. */
    public int softDeleteAllForClient(UUID clientId) {
        return jdbc.update("UPDATE client_note SET deleted_at = now() WHERE client_id = :cid::uuid AND deleted_at IS NULL",
                Map.of("cid", clientId.toString()));
    }

    public Note one(UUID noteId) {
        return jdbc.queryForObject("SELECT " + COLUMNS + " FROM client_note WHERE id = :nid::uuid",
                Map.of("nid", noteId.toString()), ClientNoteJdbcRepository::row);
    }

    /** What the client file's header draws, newest edit first. */
    public List<ClientDetail.PinnedNote> pinned(UUID clientId) {
        return jdbc.query("""
                SELECT id::text AS id, body, updated_at FROM client_note
                WHERE client_id = :cid::uuid AND pinned AND deleted_at IS NULL
                ORDER BY updated_at DESC, id
                """, Map.of("cid", clientId.toString()), (rs, i) -> new ClientDetail.PinnedNote(rs.getString("id"),
                rs.getString("body"), rs.getTimestamp("updated_at").getTime()));
    }

    private static Note row(ResultSet rs, int i) throws SQLException {
        long updated = rs.getTimestamp("updated_at").getTime();
        return new Note(rs.getString("id"), rs.getString("body"), rs.getBoolean("pinned"),
                rs.getTimestamp("created_at").getTime(), updated, String.valueOf(updated));
    }
}
