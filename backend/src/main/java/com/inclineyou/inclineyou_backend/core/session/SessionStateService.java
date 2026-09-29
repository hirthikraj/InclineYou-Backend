package com.inclineyou.inclineyou_backend.core.session;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Date;
import java.sql.Timestamp;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * One session's edits and status verbs — api-contract *Schedule* (1.1): DELETE,
 * PATCH, and {@code /done} · {@code /no-show} · {@code /cancel} · {@code /reopen}.
 *
 * <p>The state machine is the contract's table, and every verb here is
 * idempotent by target state: asking for the status a session already has answers
 * 200 with no effect. Each verb locks the session row first, so two tabs acting on
 * one session take turns rather than both reading {@code scheduled}.
 *
 * <p>Charges go through {@link SessionWriteService#chargePack}, the code Mark done
 * uses, so a charged no-show and a done can never pick different packs. Reversing
 * a charge is the one update {@code package_adjustment_append_only()} allows; the
 * trigger gives the session back under the pack's row lock.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SessionStateService {

    private final NamedParameterJdbcTemplate jdbc;
    private final SessionReadService reads;
    private final SessionWriteService writes;
    private final WorkspaceClock clock;

    private static final Set<String> MODES = Set.of("floor", "home_visit", "remote");
    private static final Set<String> PATCH_KEYS = Set.of("scheduledAt", "durationMinutes", "deliveryMode", "notes");
    private static final Set<String> CANCEL_REASONS = Set.of("trainer", "client");
    private static final int MAX_NOTES = 2000;

    /** The session row as the verbs need it, read under {@code FOR UPDATE}. */
    private record Locked(String status, String clientId, boolean notStarted, boolean started,
                          String service, long version, boolean deleted, boolean liveCharge) {}

    private Map<String, Object> params(UUID trainerId, UUID sessionId) {
        var p = new HashMap<String, Object>();
        p.put("sid", sessionId.toString());
        p.put("tid", trainerId.toString());
        return p;
    }

    /**
     * The row, locked, or null when it is not this trainer's. A soft-deleted row
     * is returned (with {@code deleted}) so DELETE can answer a replay with 204;
     * every other verb treats it as a 404.
     */
    private Locked lock(Map<String, Object> p) {
        var rows = jdbc.queryForList("""
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
                """, p);
        if (rows.isEmpty()) return null;
        var r = rows.getFirst();
        p.put("cid", r.get("client_id"));
        p.put("service", r.get("service"));
        return new Locked((String) r.get("status"), (String) r.get("client_id"),
                Boolean.TRUE.equals(r.get("not_started")), Boolean.TRUE.equals(r.get("started")),
                (String) r.get("service"), ((Timestamp) r.get("updated_at")).getTime(),
                Boolean.TRUE.equals(r.get("deleted")), Boolean.TRUE.equals(r.get("live_charge")));
    }

    private Locked lockLive(Map<String, Object> p) {
        Locked s = lock(p);
        if (s == null || s.deleted()) throw notFound();
        return s;
    }

    private static ApiException notFound() {
        return ApiException.notFound("That session is not in your diary.");
    }

    private SessionReadService.SessionRow row(UUID trainerId, UUID sessionId) {
        return reads.one(trainerId, sessionId).orElseThrow(SessionStateService::notFound);
    }

    // ── DELETE /v1/sessions/{id} ───────────────────────────────────────────────

    /**
     * Take back a booking just made by mistake. Only a session that is still
     * scheduled, never started and carries no charge; anything else has a history
     * worth keeping and is cancelled instead (409 {@code SESSION_SETTLED}). A
     * replay on a row already removed answers 204 again.
     */
    @Transactional
    public void delete(UUID trainerId, UUID sessionId) {
        var p = params(trainerId, sessionId);
        Locked s = lock(p);
        if (s == null) throw notFound();
        if (s.deleted()) return;
        if (!"scheduled".equals(s.status()) || s.started() || s.liveCharge()) {
            throw settled("This session already has a history, so it can't be removed. Cancel it instead.");
        }
        jdbc.update("UPDATE scheduled_session SET deleted_at = now() WHERE id = :sid::uuid", p);
        log.info("session removed trainer={} session={}", trainerId, sessionId);
    }

    // ── PATCH /v1/sessions/{id} ────────────────────────────────────────────────

    /**
     * Move a session, or change its length, mode or note. A missing key leaves the
     * field alone and {@code null} clears it (only {@code deliveryMode} and
     * {@code notes} can be cleared). {@code status} is never accepted here.
     *
     * <p>A move clears {@code slot_id}: the schema reads NULL as "booked or moved
     * by hand", so a later change to the client's standing week leaves this
     * session where the trainer put it. The workout is not re-picked on a move.
     */
    @Transactional
    public SessionReadService.SessionRow patch(UUID trainerId, UUID sessionId, Map<String, Object> body, String ifMatch) {
        if (body == null || body.isEmpty()) throw ApiException.validation("body: send at least one field");
        for (String key : body.keySet()) {
            if ("status".equals(key)) {
                throw ApiException.validation("status: changes only through /done, /no-show, /cancel and /reopen");
            }
            if (!PATCH_KEYS.contains(key)) throw ApiException.validation(key + ": not a field this route takes");
        }

        var p = params(trainerId, sessionId);
        Locked s = lockLive(p);
        if (ifMatch != null && !ifMatch.isBlank() && !"*".equals(ifMatch.strip())) {
            String want = ifMatch.strip().replaceFirst("^W/", "").replace("\"", "");
            if (!want.equals(String.valueOf(s.version()))) {
                throw new ApiException(HttpStatus.PRECONDITION_FAILED, "PRECONDITION_FAILED",
                        "This session changed since you opened it.");
            }
        }

        var sets = new StringBuilder();
        if (body.containsKey("scheduledAt")) {
            if (!(body.get("scheduledAt") instanceof Number n)) {
                throw ApiException.validation("scheduledAt: epoch ms, required when sent");
            }
            p.put("at", new Timestamp(n.longValue()));
            sets.append(", scheduled_at = :at, slot_id = NULL");
        }
        if (body.containsKey("durationMinutes")) {
            if (!(body.get("durationMinutes") instanceof Number n) || n.intValue() != n.doubleValue()
                    || n.intValue() < 1 || n.intValue() > 480) {
                throw ApiException.validation("durationMinutes: a whole number between 1 and 480");
            }
            p.put("minutes", n.intValue());
            sets.append(", duration_minutes = :minutes");
        }
        if (body.containsKey("deliveryMode")) {
            Object mode = body.get("deliveryMode");
            if (mode != null && !(mode instanceof String m && MODES.contains(m))) {
                throw ApiException.validation("deliveryMode: floor, home_visit, remote or null");
            }
            p.put("mode", mode);
            sets.append(", delivery_mode = :mode");
        }
        if (body.containsKey("notes")) {
            Object raw = body.get("notes");
            if (raw != null && !(raw instanceof String)) throw ApiException.validation("notes: text or null");
            String notes = raw == null || ((String) raw).isBlank() ? null : ((String) raw).strip();
            if (notes != null && notes.length() > MAX_NOTES) {
                throw ApiException.validation("notes: at most " + MAX_NOTES + " characters");
            }
            p.put("notes", notes);
            sets.append(", notes = :notes");
        }

        // Only the note may change once the session has happened or been called
        // off: the time, length and mode are what it was charged and logged as.
        boolean reshapes = body.containsKey("scheduledAt") || body.containsKey("durationMinutes")
                || body.containsKey("deliveryMode");
        if (reshapes && (!"scheduled".equals(s.status()) || s.started())) {
            throw settled("This session is " + describe(s) + ", so only its note can be changed.");
        }

        if (body.containsKey("scheduledAt") && startTaken(p, "at")) throw timeTaken();
        try {
            // ends_at is set_session_ends_at's; updated_at is set_updated_at's.
            jdbc.update("UPDATE scheduled_session SET " + sets.substring(2) + " WHERE id = :sid::uuid", p);
        } catch (DuplicateKeyException e) {
            throw timeTaken();
        }
        log.info("session edited trainer={} session={} fields={}", trainerId, sessionId, body.keySet());
        return row(trainerId, sessionId);
    }

    // ── POST /v1/sessions/{id}/done ────────────────────────────────────────────

    /**
     * The single form of the batch mark — the same {@code markOne}, so the two
     * cannot disagree. The batch's {@code skipped} becomes a 409 here and
     * {@code not_found} a 404; everything else is the batch's item shape.
     */
    @Transactional
    public SessionWriteService.MarkResult markDone(UUID trainerId, UUID sessionId, Map<String, Object> body) {
        noKeys(body);
        var r = writes.markOne(trainerId, sessionId);
        return switch (r.outcome()) {
            case "not_found" -> throw notFound();
            case "skipped" -> throw "SESSION_CANCELLED".equals(r.reason())
                    ? ApiException.conflict("SESSION_CANCELLED", "This session was cancelled. Reopen it first.")
                    : ApiException.conflict("SESSION_NOT_STARTED", "This session's start time hasn't come yet.");
            default -> r;
        };
    }

    // ── POST /v1/sessions/{id}/no-show ─────────────────────────────────────────

    /**
     * @param reason on {@code charged: false}, why not — only when a charge was
     *               asked for and no pack could take it
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record NoShowResult(String sessionId, String status, boolean charged,
                               String packageId, Integer sessionsRemaining, String reason) {}

    /**
     * Record a no-show and settle it against what the session has already been
     * charged: {@code charge: true} with no live charge writes one, {@code false}
     * with a live charge reverses it, and anything else changes nothing — so a
     * repeat costs one session, and re-deciding is safe.
     */
    @Transactional
    public NoShowResult noShow(UUID trainerId, UUID sessionId, Map<String, Object> body) {
        if (body == null || !(body.get("charge") instanceof Boolean charge)) {
            throw ApiException.validation("charge: true or false, required");
        }
        for (String key : body.keySet()) {
            if (!"charge".equals(key)) throw ApiException.validation(key + ": not a field this route takes");
        }
        var p = params(trainerId, sessionId);
        Locked s = lockLive(p);
        switch (s.status()) {
            case "cancelled" -> throw ApiException.conflict("SESSION_CANCELLED", "This session was cancelled. Reopen it first.");
            case "done" -> throw ApiException.conflict("SESSION_DONE", "This session is marked done. Reopen it first.");
            default -> { /* scheduled or no_show */ }
        }
        // scheduled_session_log: a session with a log open cannot be a no-show —
        // somebody trained. Finish it, or mark it done.
        if (s.started()) throw settled("This session's log was opened, so it can't be a no-show.");
        if ("scheduled".equals(s.status()) && s.notStarted()) {
            throw ApiException.conflict("SESSION_NOT_STARTED", "This session's start time hasn't come yet.");
        }

        if (!"no_show".equals(s.status())) {
            jdbc.update("UPDATE scheduled_session SET status = 'no_show' WHERE id = :sid::uuid", p);
        }

        NoShowResult result;
        if (charge && !s.liveCharge()) {
            var c = writes.chargePack(p);
            result = new NoShowResult(sessionId.toString(), "no_show", c.charged(), c.packageId(),
                    c.sessionsRemaining(), c.reason());
        } else if (!charge && s.liveCharge()) {
            var back = reverseCharge(p);
            result = new NoShowResult(sessionId.toString(), "no_show", false, back.packageId(),
                    back.sessionsRemaining(), null);
        } else if (s.liveCharge()) {
            var held = currentCharge(p);
            result = new NoShowResult(sessionId.toString(), "no_show", true,
                    (String) held.get("package_id"), (Integer) held.get("sessions_remaining"), null);
        } else {
            result = new NoShowResult(sessionId.toString(), "no_show", false, null, null, null);
        }
        log.info("session no-show trainer={} session={} charged={}", trainerId, sessionId, result.charged());
        return result;
    }

    // ── POST /v1/sessions/{id}/cancel ──────────────────────────────────────────

    /**
     * Cancel a booking and keep it in the diary. The client's start time is freed
     * ({@code uq_scheduled_session_client_start} skips cancelled rows).
     *
     * <p>{@code reason} ({@code trainer} · {@code client}, default trainer) is
     * stored as {@code cancel_reason} (V2, R68), so a re-pause can tell a hand
     * cancel from one the pause made and never bring the first back.
     */
    @Transactional
    public SessionReadService.SessionRow cancel(UUID trainerId, UUID sessionId, Map<String, Object> body) {
        if (body != null) {
            for (String key : body.keySet()) {
                if (!"reason".equals(key)) throw ApiException.validation(key + ": not a field this route takes");
            }
            Object reason = body.get("reason");
            if (reason != null && !(reason instanceof String r && CANCEL_REASONS.contains(r))) {
                throw ApiException.validation("reason: trainer or client");
            }
        }
        var p = params(trainerId, sessionId);
        p.put("reason", body != null && body.get("reason") instanceof String r ? r : "trainer");
        Locked s = lockLive(p);
        if ("cancelled".equals(s.status())) return row(trainerId, sessionId);
        if (!"scheduled".equals(s.status()) || s.started()) {
            throw settled("This session is " + describe(s) + ", so it can't be cancelled.");
        }
        jdbc.update("UPDATE scheduled_session SET status = 'cancelled', cancel_reason = :reason WHERE id = :sid::uuid", p);
        log.info("session cancelled trainer={} session={}", trainerId, sessionId);
        return row(trainerId, sessionId);
    }

    // ── POST /v1/sessions/{id}/reopen ──────────────────────────────────────────

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ReopenEffects(boolean chargeReversed, String packageId, Integer sessionsRemaining,
                                boolean packageReopened) {}

    public record Reopened(SessionReadService.SessionRow session, ReopenEffects effects) {}

    /**
     * Take back a done, no-show or cancel: the session is scheduled again, its log
     * kept as it was, and a live charge reversed — never deleted, so the pack's
     * history shows both facts.
     */
    @Transactional
    public Reopened reopen(UUID trainerId, UUID sessionId, Map<String, Object> body) {
        noKeys(body);
        var p = params(trainerId, sessionId);
        Locked s = lockLive(p);
        if ("scheduled".equals(s.status())) {
            return new Reopened(row(trainerId, sessionId), new ReopenEffects(false, null, null, false));
        }
        if ("cancelled".equals(s.status())) {
            var client = jdbc.queryForMap("""
                    SELECT status, membership_status FROM client WHERE id = :cid::uuid
                    """, p);
            if ("archived".equals(client.get("status")) || "removed".equals(client.get("membership_status"))) {
                throw ApiException.conflict("CLIENT_NOT_BOOKABLE",
                        "This client is " + ("removed".equals(client.get("membership_status")) ? "removed" : "archived")
                                + ", so the session can't be booked again.");
            }
        }
        if ("cancelled".equals(s.status())) {
            p.put("start", jdbc.queryForObject("SELECT scheduled_at FROM scheduled_session WHERE id = :sid::uuid", p, Timestamp.class));
            if (startTaken(p, "start")) throw timeTaken();
        }
        try {
            jdbc.update("UPDATE scheduled_session SET status = 'scheduled', cancel_reason = NULL WHERE id = :sid::uuid", p);
        } catch (DuplicateKeyException e) {
            // A cancelled session gave its start back; somebody took it since.
            throw timeTaken();
        }

        ReopenEffects effects = new ReopenEffects(false, null, null, false);
        if (s.liveCharge()) {
            var back = reverseCharge(p);
            effects = new ReopenEffects(true, back.packageId(), back.sessionsRemaining(), back.reopened());
        }
        log.info("session reopened trainer={} session={} from={} chargeReversed={}",
                trainerId, sessionId, s.status(), effects.chargeReversed());
        return new Reopened(row(trainerId, sessionId), effects);
    }

    // ── charges ────────────────────────────────────────────────────────────────

    private record Reversed(String packageId, Integer sessionsRemaining, boolean reopened) {}

    private Map<String, Object> currentCharge(Map<String, Object> p) {
        return jdbc.queryForMap("""
                SELECT a.package_id::text AS package_id, k.sessions_remaining
                FROM package_adjustment a JOIN package k ON k.id = a.package_id
                WHERE a.session_id = :sid::uuid AND a.kind = 'session' AND a.reversed_at IS NULL
                """, p);
    }

    /**
     * Reverse this session's live charge: {@code reversed_at} is set, and
     * {@code apply_package_adjustment} gives the session back under the pack's
     * lock.
     *
     * <p>R67: if that charge was the one that used the pack up, the pack closed as
     * {@code completed} and now has a session left, which is a contradiction. It
     * goes back to {@code active} when its end date hasn't passed (or it has none).
     * An expired, cancelled or refunded pack stays closed, and the session is
     * simply uncharged. No trigger refuses completed → active: {@code package_closed}
     * only ties {@code closed_at} to the status.
     */
    private Reversed reverseCharge(Map<String, Object> p) {
        String packageId = jdbc.queryForObject("""
                UPDATE package_adjustment SET reversed_at = now()
                WHERE session_id = :sid::uuid AND kind = 'session' AND reversed_at IS NULL
                RETURNING package_id::text
                """, p, String.class);
        p.put("pid", packageId);
        p.put("today", Date.valueOf(WorkspaceClock.today(clock.zone())));
        List<Boolean> reopened = jdbc.queryForList("""
                UPDATE package SET status = 'active', closed_at = NULL
                WHERE id = :pid::uuid AND status = 'completed' AND sessions_remaining > 0
                  AND (end_date IS NULL OR end_date >= :today)
                RETURNING true
                """, p, Boolean.class);
        Integer left = jdbc.queryForObject("SELECT sessions_remaining FROM package WHERE id = :pid::uuid", p, Integer.class);
        return new Reversed(packageId, left, !reopened.isEmpty());
    }

    // ── helpers ────────────────────────────────────────────────────────────────

    /**
     * Whether another live session of this client already starts at {@code p[key]}.
     * Asked before the write so the answer is a clean 409 rather than a unique
     * violation, which in Postgres aborts the whole transaction;
     * {@code uq_scheduled_session_client_start} still catches a true race.
     */
    private boolean startTaken(Map<String, Object> p, String key) {
        p.put("clashAt", p.get(key));
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM scheduled_session
                               WHERE client_id = :cid::uuid AND scheduled_at = :clashAt AND id <> :sid::uuid
                                 AND deleted_at IS NULL AND status <> 'cancelled')
                """, p, Boolean.class));
    }

    private static void noKeys(Map<String, Object> body) {
        if (body != null && !body.isEmpty()) {
            throw ApiException.validation(body.keySet().iterator().next() + ": this route takes no fields");
        }
    }

    private static String describe(Locked s) {
        if (s.started() && "scheduled".equals(s.status())) return "already started";
        return switch (s.status()) {
            case "done" -> "done";
            case "no_show" -> "a no-show";
            case "cancelled" -> "cancelled";
            default -> s.status();
        };
    }

    private static ApiException settled(String message) {
        return ApiException.conflict("SESSION_SETTLED", message);
    }

    private static ApiException timeTaken() {
        return ApiException.conflict("SESSION_CLIENT_TIME_TAKEN", "This client already has a session at that time.");
    }
}
