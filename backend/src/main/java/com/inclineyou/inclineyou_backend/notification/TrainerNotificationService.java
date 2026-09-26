package com.inclineyou.inclineyou_backend.notification;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * V15 · the trainer's bell — events somebody ELSE did to their book.
 *
 * <p>Rows are facts ({@code kind}, {@code clientId}, {@code amount},
 * {@code subjectAt}, {@code text}); the web's {@code lib/notifications/copy.ts}
 * writes the sentence. Reading is the trainer's own feed, 90 days deep, newest
 * first — with no {@code ?unread} filter, because the header counts what the list
 * holds. Marking one is idempotent and never un-reads ({@code readAt} is when it
 * was FIRST seen); marking all is one request. There is no route that marks a
 * row unread.
 *
 * <p>Minting goes through {@code mint_trainer_notification()} and nothing else,
 * because the actor is always somebody other than the recipient — a teammate
 * admin, a client in the portal — and neither may write another person's bell
 * through a policy. It runs inside the caller's transaction, so the bell row
 * lands exactly when the event does (a rolled-back reassign leaves no row). It
 * is NOT wrapped in a catch: inside a transaction a failed statement aborts the
 * whole Postgres transaction, so swallowing it in Java would only move the
 * failure to the next statement. The inputs come from our own code and the kind
 * is checked here, so the only way it fails is a bug worth seeing.
 */
@Service
@RequiredArgsConstructor
public class TrainerNotificationService {

    /** How far back the feed reaches. */
    static final int FEED_DAYS = 90;

    private final NamedParameterJdbcTemplate jdbc;

    public record Notification(String id, String kind, String clientId, String clientName,
                               BigDecimal amount, Long subjectAt, String text, long at, Long readAt) {}

    private static final String SELECT = """
            SELECT n.id::text, n.kind, n.client_id::text, c.name AS client_name, n.amount,
                   n.subject_at, n.text, n.at, n.read_at
            FROM trainer_notification n
            LEFT JOIN client c ON c.id = n.client_id
            """;

    public List<Notification> feed(UUID trainerId) {
        return jdbc.queryForList(SELECT + """
                WHERE n.trainer_id = :tid::uuid AND n.at >= now() - make_interval(days => :days)
                ORDER BY n.at DESC, n.id
                """, Map.of("tid", trainerId.toString(), "days", FEED_DAYS))
                .stream().map(TrainerNotificationService::toWire).toList();
    }

    /** Idempotent; never un-reads. Not the caller's → 404. */
    @Transactional
    public Notification markRead(UUID trainerId, UUID id) {
        var p = Map.of("id", id.toString(), "tid", trainerId.toString());
        jdbc.update("""
                UPDATE trainer_notification SET read_at = now()
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND read_at IS NULL
                """, p);
        var rows = jdbc.queryForList(SELECT + " WHERE n.id = :id::uuid AND n.trainer_id = :tid::uuid", p);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Notification not found");
        return toWire(rows.getFirst());
    }

    /** Stamps every unread row in one statement and answers with the feed. */
    @Transactional
    public List<Notification> markAllRead(UUID trainerId) {
        jdbc.update("UPDATE trainer_notification SET read_at = now() WHERE trainer_id = :tid::uuid AND read_at IS NULL",
                Map.of("tid", trainerId.toString()));
        return feed(trainerId);
    }

    static final List<String> KINDS = List.of("payment", "cancelled", "metric");

    /**
     * Put one row on {@code recipient}'s bell, in the caller's transaction.
     *
     * @param kind  payment · cancelled · metric
     * @param text  per kind — the method or 'gym'; a day label; "value unit"
     */
    public void mint(UUID recipient, String kind, UUID clientId, BigDecimal amount, Instant subjectAt, String text) {
        if (!KINDS.contains(kind)) throw new IllegalArgumentException("unknown trainer notification kind: " + kind);
        var p = new HashMap<String, Object>();
        p.put("r", recipient.toString());
        p.put("k", kind);
        p.put("c", clientId == null ? null : clientId.toString());
        p.put("a", amount);
        p.put("s", subjectAt == null ? null : Timestamp.from(subjectAt));
        p.put("t", text);
        jdbc.queryForObject("""
                SELECT mint_trainer_notification(:r::uuid, CAST(:k AS varchar), :c::uuid,
                    CAST(:a AS numeric), CAST(:s AS timestamptz), CAST(:t AS varchar))::text
                """, p, String.class);
    }

    private static Notification toWire(Map<String, Object> r) {
        return new Notification(str(r.get("id")), str(r.get("kind")), str(r.get("client_id")),
                str(r.get("client_name")), r.get("amount") instanceof BigDecimal b ? b : null,
                millis(r.get("subject_at")), str(r.get("text")),
                millis(r.get("at")), millis(r.get("read_at")));
    }

    private static String str(Object v) { return v == null ? null : v.toString(); }

    private static Long millis(Object v) {
        if (v instanceof Timestamp ts)                 return ts.toInstant().toEpochMilli();
        if (v instanceof java.time.OffsetDateTime odt) return odt.toInstant().toEpochMilli();
        if (v instanceof Instant i)                    return i.toEpochMilli();
        return null;
    }
}
