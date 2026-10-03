package com.inclineyou.inclineyou_backend.core.session;

import com.inclineyou.inclineyou_backend.core.session.dto.ClientStanding;
import com.inclineyou.inclineyou_backend.core.session.dto.HeldCharge;
import com.inclineyou.inclineyou_backend.core.session.dto.LockedSession;
import com.inclineyou.inclineyou_backend.core.session.dto.MarkTarget;
import com.inclineyou.inclineyou_backend.core.session.dto.PayingPack;
import com.inclineyou.inclineyou_backend.core.session.dto.SessionEdit;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * All SQL that moves a session through its states and the pack charge that rides on it: the locked row, each verb's
 * UPDATE, the two batch routes, and the {@code package_adjustment} that is a charge. The state machine — which verb is
 * allowed from which status, what a repeat does — is {@link SessionStateService}'s; the choice of pack is
 * {@link SessionChargeService}'s. Every verb locks the session row first, so two tabs acting on one session take turns.
 */
@Repository
@RequiredArgsConstructor
public class SessionStateJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    private static MapSqlParameterSource of(UUID trainerId, UUID sessionId) {
        return new MapSqlParameterSource("sid", sessionId.toString()).addValue("tid", trainerId.toString());
    }

    /* ───────────────────────────────────────────────────────── one session ── */

    /**
     * The row, locked, or empty when it is not this trainer's. A soft-deleted row is returned (with {@code deleted}) so
     * DELETE can answer a replay with 204; every other verb treats it as a 404.
     */
    public Optional<LockedSession> lock(UUID trainerId, UUID sessionId) {
        return jdbc.query("""
                SELECT s.status, s.client_id::text AS client_id, s.scheduled_at > now() AS not_started,
                       s.started_at IS NOT NULL AS started, s.updated_at, s.deleted_at IS NOT NULL AS deleted,
                       coalesce(s.delivery_mode, sl.delivery_mode, cs.delivery_mode, 'floor') AS service,
                       EXISTS (SELECT 1 FROM package_adjustment a
                               WHERE a.session_id = s.id AND a.kind = 'session' AND a.reversed_at IS NULL) AS live_charge
                FROM scheduled_session s
                LEFT JOIN client_schedule_slot sl ON sl.id = s.slot_id
                LEFT JOIN client_schedule cs ON cs.client_id = s.client_id
                WHERE s.id = :sid::uuid AND s.trainer_id = :tid::uuid
                FOR UPDATE OF s
                """, of(trainerId, sessionId),
                (rs, i) -> new LockedSession(rs.getString("status"), rs.getString("client_id"),
                        rs.getBoolean("not_started"), rs.getBoolean("started"), rs.getString("service"),
                        rs.getTimestamp("updated_at").getTime(), rs.getBoolean("deleted"), rs.getBoolean("live_charge")))
                .stream().findFirst();
    }

    public void softDelete(UUID sessionId) {
        jdbc.update("UPDATE scheduled_session SET deleted_at = now() WHERE id = :sid::uuid", Map.of("sid", sessionId.toString()));
    }

    /**
     * Applies the fields that were sent. A move clears {@code slot_id}: the schema reads NULL as "booked or moved by
     * hand", so a later change to the client's standing week leaves the session where the trainer put it.
     * ends_at is set_session_ends_at's; updated_at is set_updated_at's.
     */
    public void edit(UUID sessionId, SessionEdit e) {
        var p = new MapSqlParameterSource("sid", sessionId.toString());
        var sets = new StringBuilder();
        if (e.scheduledAt() != null) {
            p.addValue("at", Timestamp.from(e.scheduledAt().value()));
            sets.append(", scheduled_at = :at, slot_id = NULL");
        }
        if (e.durationMinutes() != null) {
            p.addValue("minutes", e.durationMinutes().value());
            sets.append(", duration_minutes = :minutes");
        }
        if (e.deliveryMode() != null) {
            p.addValue("mode", e.deliveryMode().value());
            sets.append(", delivery_mode = :mode");
        }
        if (e.notes() != null) {
            p.addValue("notes", e.notes().value());
            sets.append(", notes = :notes");
        }
        jdbc.update("UPDATE scheduled_session SET " + sets.substring(2) + " WHERE id = :sid::uuid", p);
    }

    /**
     * Whether another live session of this client already starts at {@code at}. Asked before the write so the answer is
     * a clean 409 rather than a unique violation, which in Postgres aborts the whole transaction;
     * {@code uq_scheduled_session_client_start} still catches a true race.
     */
    public boolean startTaken(UUID clientId, Instant at, UUID exceptSession) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM scheduled_session
                               WHERE client_id = :cid::uuid AND scheduled_at = :at AND id <> :sid::uuid
                                 AND deleted_at IS NULL AND status <> 'cancelled')
                """, Map.of("cid", clientId.toString(), "at", Timestamp.from(at), "sid", exceptSession.toString()),
                Boolean.class));
    }

    public Instant scheduledAt(UUID sessionId) {
        return jdbc.queryForObject("SELECT scheduled_at FROM scheduled_session WHERE id = :sid::uuid",
                Map.of("sid", sessionId.toString()), Timestamp.class).toInstant();
    }

    public void markNoShow(UUID sessionId) {
        jdbc.update("UPDATE scheduled_session SET status = 'no_show' WHERE id = :sid::uuid", Map.of("sid", sessionId.toString()));
    }

    public void cancel(UUID sessionId, String reason) {
        jdbc.update("UPDATE scheduled_session SET status = 'cancelled', cancel_reason = :reason WHERE id = :sid::uuid",
                Map.of("sid", sessionId.toString(), "reason", reason));
    }

    /** Back to scheduled, the log kept as it was. A unique violation here is a start somebody took since. */
    public void reschedule(UUID sessionId) {
        jdbc.update("UPDATE scheduled_session SET status = 'scheduled', cancel_reason = NULL WHERE id = :sid::uuid",
                Map.of("sid", sessionId.toString()));
    }

    /** Delivered: and a log left open on it is over too (A4 "closes an open log"). */
    public void markDone(UUID sessionId) {
        jdbc.update("""
                UPDATE scheduled_session
                SET status = 'done', updated_at = now(),
                    ended_at = CASE WHEN started_at IS NOT NULL AND ended_at IS NULL THEN now() ELSE ended_at END
                WHERE id = :sid::uuid
                """, Map.of("sid", sessionId.toString()));
    }

    public Optional<ClientStanding> clientStanding(UUID clientId) {
        return jdbc.query("SELECT status, membership_status FROM client WHERE id = :cid::uuid",
                Map.of("cid", clientId.toString()),
                (rs, i) -> new ClientStanding(rs.getString("status"), rs.getString("membership_status"), null))
                .stream().findFirst();
    }

    /* ─────────────────────────────────────────────────────────── the batches ── */

    /**
     * One UPDATE, conditional on the log being open, so a log someone else already closed keeps its time and a double
     * click closes nothing twice. It does not change the status and does not charge the pack. Returns the ids closed.
     */
    public Set<String> closeLogs(UUID trainerId, List<UUID> ids) {
        return new HashSet<>(jdbc.queryForList("""
                UPDATE scheduled_session
                SET ended_at = now(), updated_at = now()
                WHERE id IN (:ids) AND trainer_id = :tid::uuid AND deleted_at IS NULL
                  AND started_at IS NOT NULL AND ended_at IS NULL
                RETURNING id::text
                """, Map.of("ids", ids, "tid", trainerId.toString()), String.class));
    }

    /** For the ids this trainer owns that are live: whether the log was never opened (else it was already closed). */
    public Map<String, Boolean> neverStarted(UUID trainerId, List<UUID> ids) {
        var out = new HashMap<String, Boolean>();
        jdbc.query("""
                SELECT id::text AS id, started_at IS NULL AS never_started
                FROM scheduled_session
                WHERE id IN (:ids) AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("ids", ids, "tid", trainerId.toString()),
                rs -> { out.put(rs.getString("id"), rs.getBoolean("never_started")); });
        return out;
    }

    /** When each of this trainer's live sessions among {@code ids} happened (epoch ms); an id that is not theirs is absent. */
    public Map<String, Long> scheduledAtOf(UUID trainerId, List<UUID> ids) {
        var out = new HashMap<String, Long>();
        jdbc.query("""
                SELECT id::text AS id, scheduled_at FROM scheduled_session
                WHERE id IN (:ids) AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("ids", ids, "tid", trainerId.toString()),
                rs -> { out.put(rs.getString("id"), rs.getTimestamp("scheduled_at").getTime()); });
        return out;
    }

    /**
     * The session row, locked first, so a second mark of the same session waits and then reads {@code done}. The service
     * a pack must match is the session's own mode, else its slot's, else the client's default.
     */
    public Optional<MarkTarget> lockForMark(UUID trainerId, UUID sessionId) {
        return jdbc.query("""
                SELECT s.status, s.client_id::text AS client_id,
                       (s.scheduled_at > now() AND s.started_at IS NULL) AS not_started,
                       coalesce(s.delivery_mode, sl.delivery_mode, cs.delivery_mode, 'floor') AS service
                FROM scheduled_session s
                LEFT JOIN client_schedule_slot sl ON sl.id = s.slot_id
                LEFT JOIN client_schedule cs ON cs.client_id = s.client_id
                WHERE s.id = :sid::uuid AND s.trainer_id = :tid::uuid AND s.deleted_at IS NULL
                FOR UPDATE OF s
                """, of(trainerId, sessionId),
                (rs, i) -> new MarkTarget(rs.getString("status"), rs.getString("client_id"),
                        rs.getBoolean("not_started"), rs.getString("service"))).stream().findFirst();
    }

    /* ─────────────────────────────────────────────────────────── the charge ── */

    /** The charge this session already carries — one session, one live charge (uq_package_adjustment_live_charge). */
    public Optional<HeldCharge> liveCharge(UUID sessionId) {
        return jdbc.query("""
                SELECT a.package_id::text AS package_id, k.sessions_remaining
                FROM package_adjustment a JOIN package k ON k.id = a.package_id
                WHERE a.session_id = :sid::uuid AND a.kind = 'session' AND a.reversed_at IS NULL
                """, Map.of("sid", sessionId.toString()),
                (rs, i) -> new HeldCharge(rs.getString("package_id"), rs.getInt("sessions_remaining"))).stream().findFirst();
    }

    /**
     * This client's live session pack for the service: a running, unpaused pack with sessions left comes first, and
     * among those the oldest (idx_package_charge), so packs are used up in the order they were sold.
     */
    public Optional<PayingPack> payingPack(UUID clientId, String service) {
        return jdbc.query("""
                SELECT id::text AS id, sessions_remaining, paused_at IS NOT NULL AS paused
                FROM package
                WHERE client_id = :cid::uuid AND service = :service AND basis = 'sessions'
                  AND status = 'active' AND deleted_at IS NULL
                ORDER BY (paused_at IS NULL AND sessions_remaining > 0) DESC,
                         start_date NULLS LAST, created_at, id
                LIMIT 1
                """, Map.of("cid", clientId.toString(), "service", service),
                (rs, i) -> new PayingPack(rs.getString("id"), rs.getInt("sessions_remaining"), rs.getBoolean("paused")))
                .stream().findFirst();
    }

    /** tenant_id is stamped by the trigger; the decrement is apply_package_adjustment's. */
    public void insertCharge(UUID trainerId, UUID packageId, UUID clientId, UUID sessionId) {
        jdbc.update("""
                INSERT INTO package_adjustment (trainer_id, package_id, client_id, kind, sessions, session_id)
                VALUES (:tid::uuid, :pid::uuid, :cid::uuid, 'session', -1, :sid::uuid)
                """, Map.of("tid", trainerId.toString(), "pid", packageId.toString(), "cid", clientId.toString(),
                "sid", sessionId.toString()));
    }

    /** The charge that uses up the last session closes the pack in the same transaction (1.1, L5). Answers what is left. */
    public int closeIfEmpty(UUID packageId) {
        return jdbc.queryForObject("""
                UPDATE package
                SET status = CASE WHEN sessions_remaining = 0 THEN 'completed' ELSE status END,
                    closed_at = CASE WHEN sessions_remaining = 0 THEN now() ELSE closed_at END
                WHERE id = :pid::uuid
                RETURNING sessions_remaining
                """, Map.of("pid", packageId.toString()), Integer.class);
    }

    /**
     * Reverse this session's live charge: {@code reversed_at} is set, and {@code apply_package_adjustment} gives the
     * session back under the pack's lock. Answers the pack it came off.
     */
    public String reverseCharge(UUID sessionId) {
        return jdbc.queryForObject("""
                UPDATE package_adjustment SET reversed_at = now()
                WHERE session_id = :sid::uuid AND kind = 'session' AND reversed_at IS NULL
                RETURNING package_id::text
                """, Map.of("sid", sessionId.toString()), String.class);
    }

    /**
     * R67: a pack the reversed charge had used up closed as {@code completed} and now has a session left, which is a
     * contradiction. It goes back to {@code active} when its end date hasn't passed (or it has none); an expired,
     * cancelled or refunded pack stays closed. No trigger refuses completed → active.
     */
    public boolean reopenPackIfWithinTerm(UUID packageId, LocalDate today) {
        return !jdbc.queryForList("""
                UPDATE package SET status = 'active', closed_at = NULL
                WHERE id = :pid::uuid AND status = 'completed' AND sessions_remaining > 0
                  AND (end_date IS NULL OR end_date >= :today)
                RETURNING true
                """, Map.of("pid", packageId.toString(), "today", Date.valueOf(today)), Boolean.class).isEmpty();
    }

    public int sessionsRemaining(UUID packageId) {
        return jdbc.queryForObject("SELECT sessions_remaining FROM package WHERE id = :pid::uuid",
                Map.of("pid", packageId.toString()), Integer.class);
    }
}
