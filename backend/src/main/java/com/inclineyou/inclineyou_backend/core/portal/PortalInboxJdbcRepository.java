package com.inclineyou.inclineyou_backend.core.portal;

import com.inclineyou.inclineyou_backend.core.portal.dto.PortalInbox;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The SQL behind the client's inbox. Every statement names the client's id AND runs through their lens, so the two walls fail separately. The
 * only columns a client writes here are {@code read_at}, which the column guard says again.
 */
@Repository
@RequiredArgsConstructor
public class PortalInboxJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    private static Map<String, Object> p(UUID client, Timestamp at, UUID id, int n) {
        var m = new HashMap<String, Object>();
        m.put("c", client.toString());
        m.put("at", at);
        m.put("id", id == null ? null : id.toString());
        m.put("n", n);
        return m;
    }

    private static Long ms(Timestamp t) {
        return t == null ? null : t.getTime();
    }

    public record MessageRow(PortalInbox.Message item, Timestamp at) {}

    /** Newest first by {@code (at, id)} over {@code idx_client_message_client}. */
    public List<MessageRow> messages(UUID client, Timestamp beforeAt, UUID beforeId, int limit, String trainerName) {
        return jdbc.query("""
                SELECT id::text AS id, kind, body, at, read_at, session_id::text AS sid FROM client_message
                 WHERE client_id = :c::uuid AND deleted_at IS NULL
                   AND (CAST(:at AS timestamptz) IS NULL OR (at, id) < (CAST(:at AS timestamptz), CAST(:id AS uuid)))
                 ORDER BY at DESC, id DESC LIMIT :n""", p(client, beforeAt, beforeId, limit),
                (rs, i) -> new MessageRow(new PortalInbox.Message(rs.getString("id"), rs.getString("kind"), rs.getString("body"), rs.getTimestamp("at").getTime(),
                        ms(rs.getTimestamp("read_at")), rs.getString("sid"), trainerName), rs.getTimestamp("at")));
    }

    /** Sets {@code read_at} once. False when there is no such message for this client; true when it exists, read before or not. */
    public boolean markMessageRead(UUID client, UUID id) {
        var m = new HashMap<String, Object>();
        m.put("c", client.toString());
        m.put("id", id.toString());
        boolean exists = Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM client_message WHERE id = :id::uuid AND client_id = :c::uuid AND deleted_at IS NULL)", m, Boolean.class));
        if (exists) jdbc.update("UPDATE client_message SET read_at = now() WHERE id = :id::uuid AND client_id = :c::uuid AND read_at IS NULL AND deleted_at IS NULL", m);
        return exists;
    }

    public record NoteRow(PortalInbox.Note item, Timestamp key) {}

    /** Only what the trainer chose to share, newest first; unsharing removes it from the next read. */
    public List<NoteRow> notes(UUID client, Timestamp beforeAt, UUID beforeId, int limit, String author) {
        return jdbc.query("""
                SELECT id::text AS id, body, shared_at, created_at FROM client_note
                 WHERE client_id = :c::uuid AND shared_with_client AND deleted_at IS NULL
                   AND (CAST(:at AS timestamptz) IS NULL OR (created_at, id) < (CAST(:at AS timestamptz), CAST(:id AS uuid)))
                 ORDER BY created_at DESC, id DESC LIMIT :n""", p(client, beforeAt, beforeId, limit),
                (rs, i) -> new NoteRow(new PortalInbox.Note(rs.getString("id"), rs.getString("body"), rs.getTimestamp("shared_at").getTime(),
                        rs.getTimestamp("created_at").getTime(), author), rs.getTimestamp("created_at")));
    }

    public record NoticeRow(PortalInbox.Notice item, Timestamp at) {}

    /** The bell, newest first by {@code (at, id)} over {@code idx_client_notification_feed}. {@code checkin} is stored; it rides as {@code assessment}. */
    public List<NoticeRow> notices(UUID client, boolean unreadOnly, Timestamp beforeAt, UUID beforeId, int limit) {
        return jdbc.query("""
                SELECT id::text AS id, CASE kind WHEN 'checkin' THEN 'assessment' ELSE kind END AS kind, text, at, read_at, session_id::text AS sid, subject_at,
                       CASE WHEN client_can_see_money(client_id) THEN amount END AS amount
                  FROM client_notification
                 WHERE client_id = :c::uuid AND deleted_at IS NULL AND (NOT :unread OR read_at IS NULL)
                   AND (CAST(:at AS timestamptz) IS NULL OR (at, id) < (CAST(:at AS timestamptz), CAST(:id AS uuid)))
                 ORDER BY at DESC, id DESC LIMIT :n""".replace(":unread", unreadOnly ? "true" : "false"), p(client, beforeAt, beforeId, limit),
                (rs, i) -> new NoticeRow(new PortalInbox.Notice(rs.getString("id"), rs.getString("kind"), rs.getString("text"), rs.getTimestamp("at").getTime(),
                        ms(rs.getTimestamp("read_at")), rs.getString("sid"), ms(rs.getTimestamp("subject_at")), rs.getBigDecimal("amount")), rs.getTimestamp("at")));
    }

    public int unreadCount(UUID client) {
        return jdbc.queryForObject("SELECT count(*) FROM client_notification WHERE client_id = :c::uuid AND read_at IS NULL AND deleted_at IS NULL",
                Map.of("c", client.toString()), Integer.class);
    }

    public void markNoticesRead(UUID client, List<UUID> ids) {
        var m = new HashMap<String, Object>();
        m.put("c", client.toString());
        m.put("ids", ids.stream().map(UUID::toString).toList());
        jdbc.update("UPDATE client_notification SET read_at = now() WHERE client_id = :c::uuid AND read_at IS NULL AND deleted_at IS NULL AND id::text IN (:ids)", m);
    }

    public void markAllNoticesRead(UUID client) {
        jdbc.update("UPDATE client_notification SET read_at = now() WHERE client_id = :c::uuid AND read_at IS NULL AND deleted_at IS NULL", Map.of("c", client.toString()));
    }
}
