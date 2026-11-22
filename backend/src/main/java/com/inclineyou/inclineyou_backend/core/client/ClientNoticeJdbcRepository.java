package com.inclineyou.inclineyou_backend.core.client;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * The one door to a client's notification bell from the trainer's side: {@code mint_client_notification()}.
 *
 * <p>That function is the only writer of {@code client_notification}. It applies the client's own switch for the kind, does
 * nothing for a client who is not accepted, and is never called by a client, so a refused notice is simply no row and the thing
 * it pointed at (a message, a note, a plan) is still there to read. Callers do not check any of that themselves.
 */
@Repository
@RequiredArgsConstructor
public class ClientNoticeJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /**
     * @param kind {@code note}, {@code plan}, {@code session}, {@code pack}, {@code best} or {@code checkin} (never
     *             {@code reminder}, which the scheduler writes)
     * @param sessionId the session the notice is about, or null
     * @return whether a row was written: false when the client turned this kind off or is not on the portal, which is not an
     *         error for the caller, who did what they meant to, but is something a screen may want to say
     */
    public boolean mint(UUID clientId, String kind, String text, UUID sessionId) {
        return mint(clientId, kind, text, sessionId, null);
    }

    /** The same, with {@code subject_at}: what the notice is about, by its time — a shared note's {@code shared_at}. */
    public boolean mint(UUID clientId, String kind, String text, UUID sessionId, java.sql.Timestamp subjectAt) {
        var p = new HashMap<String, Object>();
        p.put("cid", clientId.toString());
        p.put("kind", kind);
        p.put("text", text);
        p.put("sid", sessionId == null ? null : sessionId.toString());
        p.put("subject", subjectAt);
        var ids = jdbc.queryForList("SELECT mint_client_notification(:cid::uuid, :kind, :text, CAST(:sid AS uuid), "
                + "CAST(:subject AS timestamptz), NULL, NULL)::text AS id", p, String.class);
        return !ids.isEmpty() && ids.get(0) != null;
    }

    /**
     * The bell notice a trainer's message made, matched to it (20 Nov 2026): this client's {@code note} notice made since the
     * message, by {@code subject_at} = the message's own time (stamped at send since this change), or — for one minted
     * before — by its quoted opening. The WHERE both of the two writes below share.
     */
    private static final String MESSAGE_NOTICE = """
             WHERE client_id = :cid::uuid AND kind = 'note' AND deleted_at IS NULL AND at >= :at
               AND (subject_at = :at OR (subject_at IS NULL AND text = :old))""";

    /** An unread message was reworded: its notice quotes the new opening, not the words the trainer just corrected. */
    public int retextMessageNotice(UUID clientId, java.sql.Timestamp messageAt, String oldOpening, String newOpening) {
        return jdbc.update("UPDATE client_notification SET text = :new " + MESSAGE_NOTICE,
                Map.of("cid", clientId.toString(), "at", messageAt, "old", oldOpening, "new", newOpening));
    }

    /** A message was deleted: its notice goes too, so a line sent to the wrong client stops showing them its first words. */
    public int retractMessageNotice(UUID clientId, java.sql.Timestamp messageAt, String oldOpening) {
        return jdbc.update("UPDATE client_notification SET deleted_at = now() " + MESSAGE_NOTICE,
                Map.of("cid", clientId.toString(), "at", messageAt, "old", oldOpening));
    }

    /**
     * Takes back the bell notice a shared note made, when the note is deleted or made private again (19 Nov 2026): it
     * quotes up to 160 characters of the note, and a note shared by mistake and removed at once stayed readable in the
     * bell. Matched by {@code subject_at} = the note's {@code shared_at} (set since 19 Nov), else — for older notices —
     * by the quoted opening, made since it was shared. Run while the note is still shared: unsharing clears shared_at.
     */
    /**
     * A shared note was reworded and stays shared (21 Nov 2026): its notice quotes the new opening, not the words the trainer
     * just corrected. Matched as {@link #retractNote} matches. Run while the note is still shared.
     */
    public int retextNote(UUID clientId, UUID noteId, String oldOpening, String newOpening) {
        return jdbc.update("""
                UPDATE client_notification n SET text = :new
                  FROM client_note cn
                 WHERE cn.id = :nid::uuid AND cn.shared_at IS NOT NULL
                   AND n.client_id = :cid::uuid AND n.kind = 'note' AND n.deleted_at IS NULL AND n.at >= cn.shared_at
                   AND (n.subject_at = cn.shared_at OR n.text = :text)""",
                Map.of("cid", clientId.toString(), "nid", noteId.toString(), "text", oldOpening, "new", newOpening));
    }

    public int retractNote(UUID clientId, UUID noteId, String opening) {
        return jdbc.update("""
                UPDATE client_notification n SET deleted_at = now()
                  FROM client_note cn
                 WHERE cn.id = :nid::uuid AND cn.shared_at IS NOT NULL
                   AND n.client_id = :cid::uuid AND n.kind = 'note' AND n.deleted_at IS NULL AND n.at >= cn.shared_at
                   AND (n.subject_at = cn.shared_at OR n.text = :text)""",
                Map.of("cid", clientId.toString(), "nid", noteId.toString(), "text", opening));
    }

    /**
     * Whether this client already has this exact notice, live, from the last {@code withinSeconds} — what lets a caller treat a
     * repeat as the one already written (a double press, a retried request) instead of minting it again.
     * Reads {@code idx_client_notification_feed}.
     */
    public boolean recentlyMinted(UUID clientId, String kind, String text, int withinSeconds) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM client_notification
                               WHERE client_id = :cid::uuid AND kind = :kind AND text = :text AND deleted_at IS NULL
                                 AND at > now() - make_interval(secs => :within) AND at <= now())
                """, Map.of("cid", clientId.toString(), "kind", kind, "text", text, "within", withinSeconds), Boolean.class));
    }
}
