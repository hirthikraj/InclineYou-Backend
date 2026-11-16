package com.inclineyou.inclineyou_backend.core.session;

import com.inclineyou.inclineyou_backend.core.session.dto.ClientStanding;
import com.inclineyou.inclineyou_backend.core.session.dto.HeldCharge;
import com.inclineyou.inclineyou_backend.core.session.dto.LockedSession;
import com.inclineyou.inclineyou_backend.core.session.dto.SingleSale;
import com.inclineyou.inclineyou_backend.core.session.dto.MarkTarget;
import com.inclineyou.inclineyou_backend.core.session.dto.PayingPack;
import com.inclineyou.inclineyou_backend.core.session.dto.SessionBilling;
import com.inclineyou.inclineyou_backend.core.session.dto.SessionEdit;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
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
                               WHERE a.session_id = s.id AND a.kind = 'session' AND a.reversed_at IS NULL) AS live_charge,
                       s.created_at > now() - make_interval(mins => :undoMinutes) AS undoable
                FROM scheduled_session s
                LEFT JOIN client_schedule_slot sl ON sl.id = s.slot_id
                LEFT JOIN client_schedule cs ON cs.client_id = s.client_id
                WHERE s.id = :sid::uuid AND s.trainer_id = :tid::uuid AND s.logged_by = 'trainer'   -- R107
                FOR UPDATE OF s
                """, Map.of("tid", trainerId.toString(), "sid", sessionId.toString(),
                        "undoMinutes", SessionStateService.UNDO_WINDOW_MINUTES),
                (rs, i) -> new LockedSession(rs.getString("status"), rs.getString("client_id"),
                        rs.getBoolean("not_started"), rs.getBoolean("started"), rs.getString("service"),
                        rs.getTimestamp("updated_at").getTime(), rs.getBoolean("deleted"), rs.getBoolean("live_charge"),
                        rs.getBoolean("undoable")))
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

    /** The session's start and length now — what a move or a new length is checked against. */
    public java.util.Map.Entry<Instant, Integer> timing(UUID sessionId) {
        return jdbc.queryForObject("SELECT scheduled_at, duration_minutes FROM scheduled_session WHERE id = :sid::uuid",
                Map.of("sid", sessionId.toString()),
                (rs, i) -> java.util.Map.entry(rs.getTimestamp("scheduled_at").toInstant(), rs.getInt("duration_minutes")));
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
                UPDATE scheduled_session s
                SET status = 'done', updated_at = now(),
                    ended_at = CASE WHEN s.started_at IS NOT NULL AND s.ended_at IS NULL THEN """ + FORGOTTEN_END + """
                                    ELSE s.ended_at END
                WHERE s.id = :sid::uuid
                """, Map.of("sid", sessionId.toString()));
    }

    /**
     * When a log nobody finished is taken to have ended (16 Nov 2026), for the two writes that close one on the
     * trainer's behalf — Close on Today's "log nobody closed" row and Mark done. It used to be {@code now()}, so a log
     * left open on Tuesday and closed on Monday recorded a session six days long, and the log screen and the client's
     * recap printed it ({@code endedAt − startedAt}). Now: the time its last set was done; with no set done, the
     * planned length from when it started; never later than now and never before it started. The log's own Finish
     * ({@code POST /v1/sessions/{id}/end}) sends the real time and is not this. Reads {@code s.} — the session row.
     */
    private static final String FORGOTTEN_END = " " + """
            least(now(), greatest(s.started_at, coalesce(
                (SELECT max(sl.done_at) FROM session_exercise se JOIN set_log sl ON sl.session_exercise_id = se.id
                 WHERE se.session_id = s.id AND se.removed_at IS NULL AND sl.done_at IS NOT NULL),
                s.started_at + make_interval(mins => s.duration_minutes)))) """;

    public Optional<ClientStanding> clientStanding(UUID clientId) {
        return jdbc.query("SELECT status, membership_status, client_type FROM client WHERE id = :cid::uuid",
                Map.of("cid", clientId.toString()),
                (rs, i) -> new ClientStanding(rs.getString("status"), rs.getString("membership_status"), null,
                        rs.getString("client_type")))
                .stream().findFirst();
    }

    /* ─────────────────────────────────────────────────────────── the batches ── */

    /**
     * One UPDATE, conditional on the log being open, so a log someone else already closed keeps its time and a double
     * click closes nothing twice. It does not change the status and does not charge the pack. Returns the ids closed.
     * The end time is {@link #FORGOTTEN_END}'s, not the moment Close was pressed (16 Nov 2026). Any open log is closed,
     * a running one too (it simply ends now) — the service does not limit it to sessions that are over.
     */
    public Set<String> closeLogs(UUID trainerId, List<UUID> ids) {
        return new HashSet<>(jdbc.queryForList("""
                UPDATE scheduled_session s
                SET ended_at = """ + FORGOTTEN_END + """
                , updated_at = now()
                WHERE s.id IN (:ids) AND s.trainer_id = :tid::uuid AND s.deleted_at IS NULL AND s.logged_by = 'trainer'   -- R107
                  AND s.started_at IS NOT NULL AND s.ended_at IS NULL
                RETURNING s.id::text
                """, Map.of("ids", ids, "tid", trainerId.toString()), String.class));
    }

    /** For the ids this trainer owns that are live: whether the log was never opened (else it was already closed). */
    public Map<String, Boolean> neverStarted(UUID trainerId, List<UUID> ids) {
        var out = new HashMap<String, Boolean>();
        jdbc.query("""
                SELECT id::text AS id, started_at IS NULL AS never_started
                FROM scheduled_session
                WHERE id IN (:ids) AND trainer_id = :tid::uuid AND deleted_at IS NULL AND logged_by = 'trainer'   -- R107
                """, Map.of("ids", ids, "tid", trainerId.toString()),
                rs -> { out.put(rs.getString("id"), rs.getBoolean("never_started")); });
        return out;
    }

    /** When each of this trainer's live sessions among {@code ids} happened (epoch ms); an id that is not theirs is absent. */
    public Map<String, Long> scheduledAtOf(UUID trainerId, List<UUID> ids) {
        var out = new HashMap<String, Long>();
        jdbc.query("""
                SELECT id::text AS id, scheduled_at FROM scheduled_session
                WHERE id IN (:ids) AND trainer_id = :tid::uuid AND deleted_at IS NULL AND logged_by = 'trainer'   -- R107
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
                       coalesce(s.delivery_mode, sl.delivery_mode, cs.delivery_mode, 'floor') AS service,
                       s.billing, s.price, (s.scheduled_at AT TIME ZONE t.timezone)::date AS day, c.client_type,
                       ch.package_id::text AS charge_package_id, ck.sessions_remaining AS charge_remaining
                FROM scheduled_session s
                JOIN trainer t ON t.id = s.trainer_id
                JOIN client c ON c.id = s.client_id
                LEFT JOIN client_schedule_slot sl ON sl.id = s.slot_id
                LEFT JOIN client_schedule cs ON cs.client_id = s.client_id
                -- At most one, by uq_package_adjustment_live_charge.
                LEFT JOIN package_adjustment ch ON ch.session_id = s.id AND ch.kind = 'session' AND ch.reversed_at IS NULL
                LEFT JOIN package ck ON ck.id = ch.package_id
                WHERE s.id = :sid::uuid AND s.trainer_id = :tid::uuid AND s.deleted_at IS NULL AND s.logged_by = 'trainer'   -- R107
                FOR UPDATE OF s
                """, of(trainerId, sessionId),
                (rs, i) -> new MarkTarget(rs.getString("status"), rs.getString("client_id"),
                        rs.getBoolean("not_started"), rs.getString("service"),
                        new SessionBilling(rs.getString("billing"), rs.getBigDecimal("price"),
                                rs.getDate("day").toLocalDate(), rs.getString("client_type")),
                        rs.getString("charge_package_id") == null ? null
                                : new HeldCharge(rs.getString("charge_package_id"), rs.getInt("charge_remaining"))))
                .stream().findFirst();
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
    /**
     * The pack a session delivered on {@code day} is charged to (13 Nov 2026: valid ON THAT DAY — started on or before
     * it, and not ended before it). A renewal that starts next week does not pay for today, and a pack that ran out
     * on Sunday does not pay for Monday just because the hourly sweep closes it only after a 7-day grace — while a
     * Saturday session marked late on Monday is still the pack's, because Saturday was inside its term.
     */
    public Optional<PayingPack> payingPack(UUID clientId, String service, LocalDate day) {
        return jdbc.query("""
                SELECT id::text AS id, sessions_remaining, paused_at IS NOT NULL AS paused
                FROM package
                WHERE client_id = :cid::uuid AND service = :service AND basis = 'sessions'
                  AND status = 'active' AND deleted_at IS NULL
                  -- Never a single session's own sale (13 Nov 2026): since 10 Nov it exists from booking, and a pack
                  -- session taking it left that single session uncharged. check_session_billing_charge refuses it too.
                  AND session_id IS NULL
                  AND (start_date IS NULL OR start_date <= :day) AND (end_date IS NULL OR end_date >= :day)
                ORDER BY (paused_at IS NULL AND sessions_remaining > 0) DESC,
                         start_date NULLS LAST, created_at, id
                LIMIT 1
                """, Map.of("cid", clientId.toString(), "service", service, "day", Date.valueOf(day)),
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

    /* ─────────────────────────────────────────────────────────── billing (V32) ── */

    /** How the (already locked) session is paid for, its day in the trainer's calendar, and the client's type. */
    public Optional<SessionBilling> billing(UUID sessionId) {
        return jdbc.query("""
                SELECT s.billing, s.price, (s.scheduled_at AT TIME ZONE t.timezone)::date AS day, c.client_type
                FROM scheduled_session s
                JOIN trainer t ON t.id = s.trainer_id
                JOIN client c ON c.id = s.client_id
                WHERE s.id = :sid::uuid
                """, Map.of("sid", sessionId.toString()),
                (rs, i) -> new SessionBilling(rs.getString("billing"), rs.getBigDecimal("price"),
                        rs.getDate("day").toLocalDate(), rs.getString("client_type"))).stream().findFirst();
    }

    /** Set how a session is paid for. The caller holds the row lock and has checked it carries no live charge. */
    public void setBilling(UUID sessionId, String billing, BigDecimal price) {
        var p = new HashMap<String, Object>();
        p.put("sid", sessionId.toString());
        p.put("billing", billing);
        p.put("price", price);
        jdbc.update("UPDATE scheduled_session SET billing = :billing, price = :price WHERE id = :sid::uuid", p);
    }

    /**
     * This single session's own sale (V32/V33): not deleted and not refunded — at most one, by uq_package_single_session.
     * Empty for a session that has none yet (booked before 10 Nov 2026, or not single).
     */
    public Optional<SingleSale> sale(UUID sessionId) {
        return jdbc.query("""
                SELECT k.id::text AS id, k.status, k.sessions_remaining, k.paused_at IS NOT NULL AS paused, k.created_at,
                       EXISTS (SELECT 1 FROM payment y WHERE y.package_id = k.id AND y.deleted_at IS NULL) AS has_money,
                       k.created_at = s.created_at AS booked_with_it
                FROM package k JOIN scheduled_session s ON s.id = k.session_id
                WHERE k.session_id = :sid::uuid AND k.deleted_at IS NULL AND k.status <> 'refunded'
                """, Map.of("sid", sessionId.toString()),
                (rs, i) -> new SingleSale(rs.getString("id"), rs.getString("status"), rs.getInt("sessions_remaining"),
                        rs.getBoolean("paused"), rs.getBoolean("has_money"), rs.getTimestamp("created_at").toInstant(),
                        rs.getBoolean("booked_with_it")))
                .stream().findFirst();
    }

    /**
     * Sell the one-session package a single session is paid by: due on the session's day, no expiry (so a reopen that
     * gives the session back can always reopen it), no pack, no share — a single session is the trainer's own sale.
     */
    public void insertSinglePack(UUID packageId, UUID trainerId, UUID clientId, UUID sessionId, String service,
                                 BigDecimal price, String currency, LocalDate day) {
        var p = new HashMap<String, Object>();
        p.put("id", packageId.toString());
        p.put("tid", trainerId.toString());
        p.put("cid", clientId.toString());
        p.put("sid", sessionId.toString());
        p.put("service", service);
        p.put("price", price);
        p.put("currency", currency);
        p.put("day", Date.valueOf(day));
        jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, session_id, name, service, basis, sessions_total,
                                     sessions_remaining, amount, currency, start_date, due_date)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, :sid::uuid, 'Single session', :service, 'sessions', 1,
                        1, :price, :currency, :day, :day)
                """, p);
    }

    /** Close a sale with nothing owed (a cancel or a no-show the trainer chose not to charge): kept, status cancelled. */
    public void closeSale(UUID packageId) {
        jdbc.update("UPDATE package SET status = 'cancelled', closed_at = now() WHERE id = :pid::uuid AND status = 'active'",
                Map.of("pid", packageId.toString()));
    }

    /** A closed sale owed again: its session was reopened. */
    public void reviveSale(UUID packageId) {
        jdbc.update("UPDATE package SET status = 'active', closed_at = NULL WHERE id = :pid::uuid AND status = 'cancelled'",
                Map.of("pid", packageId.toString()));
    }

    /** Gone without a trace: the booking it was for was taken back, or stopped being single, before any money moved. */
    public void dropSale(UUID packageId) {
        jdbc.update("""
                UPDATE package SET deleted_at = now(), status = 'cancelled', closed_at = coalesce(closed_at, now())
                WHERE id = :pid::uuid
                """, Map.of("pid", packageId.toString()));
    }

    /**
     * A moved session takes its sale's day with it: started and due on the session's (new) day. The due date changes
     * only through a {@code due_date} adjustment (guard_package_balance), so the pack's history shows the move; the
     * start date is not guarded.
     */
    public void moveSale(UUID packageId, LocalDate day) {
        var p = Map.<String, Object>of("pid", packageId.toString(), "day", Date.valueOf(day));
        jdbc.update("UPDATE package SET start_date = :day WHERE id = :pid::uuid", p);
        jdbc.update("""
                INSERT INTO package_adjustment (trainer_id, package_id, client_id, kind, due_date, reason)
                SELECT k.trainer_id, k.id, k.client_id, 'due_date', :day, 'session moved'
                FROM package k WHERE k.id = :pid::uuid AND k.due_date IS DISTINCT FROM :day
                """, p);
    }

    /** A new price on a sale nothing was paid on. */
    public void repriceSale(UUID packageId, BigDecimal price) {
        jdbc.update("UPDATE package SET amount = :price WHERE id = :pid::uuid",
                Map.of("pid", packageId.toString(), "price", price));
    }

    public int sessionsRemaining(UUID packageId) {
        return jdbc.queryForObject("SELECT sessions_remaining FROM package WHERE id = :pid::uuid",
                Map.of("pid", packageId.toString()), Integer.class);
    }
}
