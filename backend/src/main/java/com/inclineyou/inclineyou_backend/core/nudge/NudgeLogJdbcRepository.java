package com.inclineyou.inclineyou_backend.core.nudge;

import com.inclineyou.inclineyou_backend.core.nudge.dto.DraftClient;
import com.inclineyou.inclineyou_backend.core.nudge.dto.LoggedDraft;
import com.inclineyou.inclineyou_backend.core.nudge.dto.NewNudgeLog;
import com.inclineyou.inclineyou_backend.core.nudge.dto.NudgeSummary;
import com.inclineyou.inclineyou_backend.shared.wire.Cursor;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * All SQL on {@code nudge_log} and the reads a drafted message is built from. {@code nudge_log} is append-only
 * (a trigger refuses any UPDATE) and a row is never deleted by this API: it is the record that a message was
 * handed to WhatsApp, and the cooldown the queue reads is computed from it. What a message SAYS, and which
 * template needs which figure, is {@link NudgeDraftService}'s.
 */
@Repository
@RequiredArgsConstructor
public class NudgeLogJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /* ─────────────────────────────────────────────────────────── the history ── */

    /**
     * Messages drafted on or after {@code since}, newest first, on idx_nudge_log_trainer_sent
     * (idx_nudge_log_client_sent with a client). Keyset on (sent_at, id) descending; {@code fetch} is one more than
     * the page so the caller can tell whether there is a next one.
     */
    public List<NudgeSummary> page(UUID trainerId, Instant since, UUID clientId, Cursor after,
                                   boolean withMessage, int fetch) {
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("from", Timestamp.from(since));
        p.put("limit", fetch);
        var where = new StringBuilder();
        if (clientId != null) {
            p.put("cid", clientId.toString());
            where.append(" AND client_id = :cid::uuid");
        }
        if (after != null) {
            p.put("afterAt", after.keyAsTimestamp());
            p.put("afterId", after.id().toString());
            where.append(" AND (sent_at, id) < (:afterAt, :afterId::uuid)");
        }
        return jdbc.query("""
                SELECT id::text AS id, client_id::text AS client_id, template, reason, sent_at, message
                FROM nudge_log
                WHERE trainer_id = :tid::uuid AND sent_at >= :from""" + where + """

                ORDER BY sent_at DESC, id DESC
                LIMIT :limit
                """, p,
                (rs, i) -> new NudgeSummary(
                        rs.getString("id"),
                        rs.getString("client_id"),
                        rs.getString("template"),
                        rs.getString("reason"),
                        rs.getTimestamp("sent_at").getTime(),
                        withMessage ? rs.getString("message") : null,
                        Cursor.key(rs.getTimestamp("sent_at"))));
    }

    /* ──────────────────────────────────────────────────────────── the draft ── */

    /** The client's name and number and the trainer's name; empty when the client is not this trainer's or is deleted. */
    public Optional<DraftClient> draftClient(UUID trainerId, UUID clientId) {
        return jdbc.query("""
                SELECT c.name, c.phone, t.name AS trainer_name
                FROM client c JOIN trainer t ON t.id = :tid::uuid
                WHERE c.id = :cid::uuid AND c.trainer_id = :tid::uuid AND c.deleted_at IS NULL
                """, Map.of("tid", trainerId.toString(), "cid", clientId.toString()),
                (rs, i) -> new DraftClient(rs.getString("name"), rs.getString("phone"), rs.getString("trainer_name")))
                .stream().findFirst();
    }

    /** A row already written under this id — by anyone — so a replay can be answered or refused. */
    public Optional<LoggedDraft> byId(UUID id) {
        return jdbc.query("""
                SELECT trainer_id::text AS tid, client_id::text AS cid, message, sent_at
                FROM nudge_log WHERE id = :id::uuid
                """, Map.of("id", id.toString()),
                (rs, i) -> new LoggedDraft(rs.getString("tid"), rs.getString("cid"), rs.getString("message"),
                        rs.getTimestamp("sent_at").getTime())).stream().findFirst();
    }

    public boolean packageOfClient(UUID trainerId, UUID clientId, UUID packageId) {
        return !jdbc.queryForList("SELECT 1 FROM package WHERE id = :pid::uuid AND client_id = :cid::uuid "
                        + "AND trainer_id = :tid::uuid AND deleted_at IS NULL",
                Map.of("pid", packageId.toString(), "cid", clientId.toString(), "tid", trainerId.toString())).isEmpty();
    }

    public boolean sessionOfClient(UUID trainerId, UUID clientId, UUID sessionId) {
        return !jdbc.queryForList("SELECT 1 FROM scheduled_session WHERE id = :sid::uuid AND client_id = :cid::uuid "
                        + "AND trainer_id = :tid::uuid AND deleted_at IS NULL",
                Map.of("sid", sessionId.toString(), "cid", clientId.toString(), "tid", trainerId.toString())).isEmpty();
    }

    /**
     * Appends the row and answers the {@code sent_at} the database gave it, as epoch ms. tenant_id is stamped by
     * the trigger. A duplicate id surfaces as a {@code DuplicateKeyException} for the service to turn into the
     * wire's id conflict.
     */
    public long append(NewNudgeLog log) {
        var p = new HashMap<String, Object>();
        p.put("id", log.id().toString());
        p.put("tid", log.trainerId().toString());
        p.put("cid", log.clientId().toString());
        p.put("reason", log.reason());
        p.put("template", log.template());
        p.put("pid", log.packageId() == null ? null : log.packageId().toString());
        p.put("sid", log.sessionId() == null ? null : log.sessionId().toString());
        p.put("message", log.message());
        Long sentAt = jdbc.queryForObject("""
                INSERT INTO nudge_log (id, trainer_id, client_id, reason, template, channel,
                                       package_id, session_id, message)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, :reason, :template, 'whatsapp_manual',
                        :pid::uuid, :sid::uuid, :message)
                RETURNING (extract(epoch FROM sent_at) * 1000)::bigint
                """, p, Long.class);
        return sentAt == null ? System.currentTimeMillis() : sentAt;
    }

    /* ─────────────────────────────────────────── the figures a message quotes ── */

    /** No-shows in the last thirty days — the roster's reading of "missed 2+", a count and not a streak. */
    public int noShowsInLast30Days(UUID clientId) {
        Integer n = jdbc.queryForObject("""
                SELECT count(*)::int FROM scheduled_session
                WHERE client_id = :cid::uuid AND status = 'no_show' AND deleted_at IS NULL AND logged_by = 'trainer'   -- R107
                  AND scheduled_at >= now() - interval '30 days'
                """, Map.of("cid", clientId.toString()), Integer.class);
        return n == null ? 0 : n;
    }

    /** Sessions delivered, all time — the count the client file's {@code stats.sessionsDone} reports. */
    public int doneSessions(UUID clientId) {
        Integer n = jdbc.queryForObject("""
                SELECT count(*)::int FROM scheduled_session
                WHERE client_id = :cid::uuid AND status = 'done' AND deleted_at IS NULL AND logged_by = 'trainer'   -- R107
                """, Map.of("cid", clientId.toString()), Integer.class);
        return n == null ? 0 : n;
    }

    /**
     * Whole days from the last delivered session to {@code today}, both on the workspace's calendar; null when
     * nothing has ever been delivered ("0 days" would be a lie about somebody who has never had one).
     */
    public Integer daysSinceLastDone(UUID clientId, String zoneId, LocalDate today) {
        return jdbc.queryForObject("""
                SELECT (:today - max((scheduled_at AT TIME ZONE :tz)::date))::int FROM scheduled_session
                WHERE client_id = :cid::uuid AND status = 'done' AND deleted_at IS NULL AND logged_by = 'trainer'   -- R107
                """, Map.of("cid", clientId.toString(), "tz", zoneId, "today", java.sql.Date.valueOf(today)),
                Integer.class);
    }
}
