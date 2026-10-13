package com.inclineyou.inclineyou_backend.core.notification;

import com.inclineyou.inclineyou_backend.core.notification.dto.Bell;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The SQL behind the trainer's bell: six reads over rows the product already keeps, merged, and the one column that says when the
 * trainer last looked ({@code trainer.bell_seen_at}).
 *
 * <p>Each event is read from the table that records it, and none of them is a copy:
 * <ul>
 *   <li>joined — {@code client.accepted_at};</li>
 *   <li>declined — a {@code client_invite} in the {@code declined} state;</li>
 *   <li>left — {@code client.removed_at} where {@code removed_by = 'client'} (a trainer removing someone is the trainer's own
 *       act and not news to them);</li>
 *   <li>self-run done — a finished {@code logged_by = 'client'} session;</li>
 *   <li>assessment submitted — a completed assessment with {@code entered_by = 'client'};</li>
 *   <li>hard feedback — a {@code workout_feedback} whose effort was {@code hard}.</li>
 * </ul>
 * Only this trainer's clients, only the last {@value #WINDOW_DAYS} days, and never a client who has been deleted or erased.
 */
@Repository
@RequiredArgsConstructor
public class NotificationJdbcRepository {

    static final int WINDOW_DAYS = 14;

    private final NamedParameterJdbcTemplate jdbc;

    /** Every event in the window, before ordering. One indexed read per kind. */
    private static final String EVENTS = """
            SELECT 'client_joined' AS kind, 'joined:' || c.id AS key, c.accepted_at AS at, c.id AS client_id, c.name AS client_name,
                   NULL::uuid AS session_id, NULL::text AS detail
            FROM client c
            WHERE c.trainer_id = :tid::uuid AND c.deleted_at IS NULL AND c.erased_at IS NULL
              AND c.accepted_at >= now() - interval '14 days'
            UNION ALL
            SELECT 'client_declined', 'declined:' || i.id, i.declined_at, c.id, c.name, NULL::uuid, i.decline_reason
            FROM client_invite i JOIN client c ON c.id = i.client_id
            WHERE i.trainer_id = :tid::uuid AND i.status = 'declined' AND i.declined_at >= now() - interval '14 days'
              AND c.deleted_at IS NULL AND c.erased_at IS NULL
            UNION ALL
            SELECT 'client_left', 'left:' || c.id, c.removed_at, c.id, c.name, NULL::uuid, NULL::text
            FROM client c
            WHERE c.trainer_id = :tid::uuid AND c.removed_by = 'client' AND c.removed_at >= now() - interval '14 days'
              AND c.deleted_at IS NULL AND c.erased_at IS NULL
            UNION ALL
            SELECT 'client_selfrun_done', 'selfrun:' || s.id, coalesce(s.ended_at, s.scheduled_at), c.id, c.name, s.id, NULL::text
            FROM scheduled_session s JOIN client c ON c.id = s.client_id
            WHERE c.trainer_id = :tid::uuid AND s.logged_by = 'client' AND s.status = 'done' AND s.deleted_at IS NULL
              AND coalesce(s.ended_at, s.scheduled_at) >= now() - interval '14 days'
              AND c.deleted_at IS NULL AND c.erased_at IS NULL
            UNION ALL
            SELECT 'assessment_submitted', 'assessment:' || a.id, a.completed_at, c.id, c.name, NULL::uuid, a.name
            FROM assessment a JOIN client c ON c.id = a.client_id
            WHERE a.trainer_id = :tid::uuid AND a.entered_by = 'client' AND a.deleted_at IS NULL
              AND a.completed_at >= now() - interval '14 days' AND c.deleted_at IS NULL AND c.erased_at IS NULL
            UNION ALL
            SELECT 'feedback_hard', 'feedback:' || f.id, f.at, c.id, c.name, f.session_id, NULL::text
            FROM workout_feedback f JOIN client c ON c.id = f.client_id
            WHERE c.trainer_id = :tid::uuid AND f.effort = 'hard' AND f.deleted_at IS NULL
              AND f.at >= now() - interval '14 days' AND c.deleted_at IS NULL AND c.erased_at IS NULL
            """;

    /** Newest first, ties broken by key so the order is the same on every read. */
    public List<Bell.Item> events(UUID trainerId, int limit) {
        return jdbc.query("SELECT kind, key, at, client_id::text AS client_id, client_name, session_id::text AS session_id, detail FROM ("
                        + EVENTS + ") e ORDER BY at DESC, key DESC LIMIT :n",
                Map.of("tid", trainerId.toString(), "n", limit),
                (rs, i) -> new Bell.Item(rs.getString("key"), rs.getString("kind"), rs.getTimestamp("at").getTime(),
                        new Bell.Who(rs.getString("client_id"), rs.getString("client_name")),
                        rs.getString("session_id"), rs.getString("detail")));
    }

    /** Events after {@code seenAt} (or every event in the window when the trainer has never looked). */
    public int unread(UUID trainerId, Timestamp seenAt) {
        var p = new java.util.HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("seen", seenAt);
        Integer n = jdbc.queryForObject("SELECT count(*) FROM (" + EVENTS + ") e WHERE CAST(:seen AS timestamptz) IS NULL OR e.at > CAST(:seen AS timestamptz)",
                p, Integer.class);
        return n == null ? 0 : n;
    }

    public Timestamp seenAt(UUID trainerId) {
        return jdbc.queryForObject("SELECT bell_seen_at FROM trainer WHERE id = :tid::uuid",
                Map.of("tid", trainerId.toString()), Timestamp.class);
    }

    /** One column, and it only ever moves forward: now. */
    public void markSeen(UUID trainerId) {
        jdbc.update("UPDATE trainer SET bell_seen_at = now() WHERE id = :tid::uuid", Map.of("tid", trainerId.toString()));
    }
}
