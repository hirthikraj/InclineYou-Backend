package com.inclineyou.inclineyou_backend.core.session;

import com.inclineyou.inclineyou_backend.core.session.dto.LockedSession;
import com.inclineyou.inclineyou_backend.core.session.dto.MarkResult;
import com.inclineyou.inclineyou_backend.core.session.dto.NoShowResult;
import com.inclineyou.inclineyou_backend.core.session.dto.ReopenEffects;
import com.inclineyou.inclineyou_backend.core.session.dto.Reopened;
import com.inclineyou.inclineyou_backend.core.session.dto.SessionEdit;
import com.inclineyou.inclineyou_backend.core.session.dto.SessionRow;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.wire.Patch;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * One session's edits and status verbs — api-contract *Schedule* (1.1): DELETE, PATCH, and {@code /done} ·
 * {@code /no-show} · {@code /cancel} · {@code /reopen}.
 *
 * <p>The state machine is the contract's table, and every verb here is idempotent by target state: asking for the
 * status a session already has answers 200 with no effect. Each verb locks the session row first, so two tabs acting on
 * one session take turns rather than both reading {@code scheduled}.
 *
 * <p>Charges go through {@link SessionChargeService}, the code Mark done uses, so a charged no-show and a done can never
 * pick different packs. Reversing a charge is the one update {@code package_adjustment_append_only()} allows; the
 * trigger gives the session back under the pack's row lock. The SQL is {@link SessionStateJdbcRepository}'s.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SessionStateService {

    private final SessionStateJdbcRepository repo;
    private final SessionJdbcRepository reads;
    private final SessionWriteService writes;
    private final SessionChargeService charges;

    private static final Set<String> MODES = Set.of("floor", "home_visit", "remote");
    private static final Set<String> PATCH_KEYS = Set.of("scheduledAt", "durationMinutes", "deliveryMode", "notes");
    private static final Set<String> CANCEL_REASONS = Set.of("trainer", "client");
    private static final int MAX_NOTES = 2000;

    /**
     * The row, locked, or a 404 when it is not this trainer's. A soft-deleted row is returned (with {@code deleted}) by
     * {@link #lock} so DELETE can answer a replay with 204; every other verb treats it as a 404.
     */
    private LockedSession lockLive(UUID trainerId, UUID sessionId) {
        var s = repo.lock(trainerId, sessionId).orElseThrow(SessionStateService::notFound);
        if (s.deleted()) throw notFound();
        return s;
    }

    private static ApiException notFound() {
        return ApiException.notFound("That session is not in your diary.");
    }

    private SessionRow row(UUID trainerId, UUID sessionId) {
        return reads.one(trainerId, sessionId).orElseThrow(SessionStateService::notFound);
    }

    // ── DELETE /v1/sessions/{id} ───────────────────────────────────────────────

    /**
     * Take back a booking just made by mistake. Only a session that is still scheduled, never started and carries no
     * charge; anything else has a history worth keeping and is cancelled instead (409 {@code SESSION_SETTLED}). A replay
     * on a row already removed answers 204 again.
     */
    @Transactional
    public void delete(UUID trainerId, UUID sessionId) {
        var s = repo.lock(trainerId, sessionId).orElseThrow(SessionStateService::notFound);
        if (s.deleted()) return;
        if (!"scheduled".equals(s.status()) || s.started() || s.liveCharge()) {
            throw settled("This session already has a history, so it can't be removed. Cancel it instead.");
        }
        repo.softDelete(sessionId);
        log.info("session removed trainer={} session={}", trainerId, sessionId);
    }

    // ── PATCH /v1/sessions/{id} ────────────────────────────────────────────────

    /**
     * Move a session, or change its length, mode or note. A missing key leaves the field alone and {@code null} clears
     * it (only {@code deliveryMode} and {@code notes} can be cleared). {@code status} is never accepted here. The body
     * stays a {@code Map}: presence of a key is the contract, which a record cannot say.
     *
     * <p>A move clears {@code slot_id}: the schema reads NULL as "booked or moved by hand", so a later change to the
     * client's standing week leaves this session where the trainer put it. The workout is not re-picked on a move.
     */
    @Transactional
    public SessionRow patch(UUID trainerId, UUID sessionId, Map<String, Object> body, String ifMatch) {
        if (body == null || body.isEmpty()) throw ApiException.validation("body: send at least one field");
        for (String key : body.keySet()) {
            if ("status".equals(key)) {
                throw ApiException.validation("status: changes only through /done, /no-show, /cancel and /reopen");
            }
            if (!PATCH_KEYS.contains(key)) throw ApiException.validation(key + ": not a field this route takes");
        }

        LockedSession s = lockLive(trainerId, sessionId);
        if (ifMatch != null && !ifMatch.isBlank() && !"*".equals(ifMatch.strip())) {
            String want = ifMatch.strip().replaceFirst("^W/", "").replace("\"", "");
            if (!want.equals(String.valueOf(s.version()))) {
                throw new ApiException(HttpStatus.PRECONDITION_FAILED, "PRECONDITION_FAILED",
                        "This session changed since you opened it.");
            }
        }
        SessionEdit edit = edit(body);

        // Only the note may change once the session has happened or been called off: the time, length and mode are
        // what it was charged and logged as.
        if (edit.reshapes() && (!"scheduled".equals(s.status()) || s.started())) {
            throw settled("This session is " + describe(s) + ", so only its note can be changed.");
        }

        if (edit.scheduledAt() != null
                && repo.startTaken(UUID.fromString(s.clientId()), edit.scheduledAt().value(), sessionId)) {
            throw timeTaken();
        }
        try {
            repo.edit(sessionId, edit);
        } catch (DuplicateKeyException e) {
            throw timeTaken();
        }
        log.info("session edited trainer={} session={} fields={}", trainerId, sessionId, body.keySet());
        return row(trainerId, sessionId);
    }

    /** The body's values, checked, as a typed edit. */
    private static SessionEdit edit(Map<String, Object> body) {
        Patch<Instant> at = null;
        Patch<Integer> minutes = null;
        Patch<String> mode = null;
        Patch<String> notes = null;
        if (body.containsKey("scheduledAt")) {
            if (!(body.get("scheduledAt") instanceof Number n)) {
                throw ApiException.validation("scheduledAt: epoch ms, required when sent");
            }
            at = Patch.of(Instant.ofEpochMilli(n.longValue()));
        }
        if (body.containsKey("durationMinutes")) {
            if (!(body.get("durationMinutes") instanceof Number n) || n.intValue() != n.doubleValue()
                    || n.intValue() < 1 || n.intValue() > 480) {
                throw ApiException.validation("durationMinutes: a whole number between 1 and 480");
            }
            minutes = Patch.of(n.intValue());
        }
        if (body.containsKey("deliveryMode")) {
            Object m = body.get("deliveryMode");
            if (m != null && !(m instanceof String str && MODES.contains(str))) {
                throw ApiException.validation("deliveryMode: floor, home_visit, remote or null");
            }
            mode = Patch.of((String) m);
        }
        if (body.containsKey("notes")) {
            Object raw = body.get("notes");
            if (raw != null && !(raw instanceof String)) throw ApiException.validation("notes: text or null");
            String text = raw == null || ((String) raw).isBlank() ? null : ((String) raw).strip();
            if (text != null && text.length() > MAX_NOTES) {
                throw ApiException.validation("notes: at most " + MAX_NOTES + " characters");
            }
            notes = Patch.of(text);
        }
        return new SessionEdit(at, minutes, mode, notes);
    }

    // ── POST /v1/sessions/{id}/done ────────────────────────────────────────────

    /**
     * The single form of the batch mark — the same {@code markOne}, so the two cannot disagree. The batch's
     * {@code skipped} becomes a 409 here and {@code not_found} a 404; everything else is the batch's item shape.
     */
    @Transactional
    public MarkResult markDone(UUID trainerId, UUID sessionId, Map<String, Object> body) {
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
     * Record a no-show and settle it against what the session has already been charged: {@code charge: true} with no
     * live charge writes one, {@code false} with a live charge reverses it, and anything else changes nothing — so a
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
        LockedSession s = lockLive(trainerId, sessionId);
        switch (s.status()) {
            case "cancelled" -> throw ApiException.conflict("SESSION_CANCELLED", "This session was cancelled. Reopen it first.");
            case "done" -> throw ApiException.conflict("SESSION_DONE", "This session is marked done. Reopen it first.");
            default -> { /* scheduled or no_show */ }
        }
        // scheduled_session_log: a session with a log open cannot be a no-show — somebody trained. Finish it, or mark
        // it done.
        if (s.started()) throw settled("This session's log was opened, so it can't be a no-show.");
        if ("scheduled".equals(s.status()) && s.notStarted()) {
            throw ApiException.conflict("SESSION_NOT_STARTED", "This session's start time hasn't come yet.");
        }

        if (!"no_show".equals(s.status())) repo.markNoShow(sessionId);

        String sid = sessionId.toString();
        NoShowResult result;
        if (charge && !s.liveCharge()) {
            var c = charges.charge(trainerId, UUID.fromString(s.clientId()), sessionId, s.service());
            result = new NoShowResult(sid, "no_show", c.charged(), c.packageId(), c.sessionsRemaining(), c.reason());
        } else if (!charge && s.liveCharge()) {
            var back = charges.reverse(sessionId);
            result = new NoShowResult(sid, "no_show", false, back.packageId(), back.sessionsRemaining(), null);
        } else if (s.liveCharge()) {
            var held = repo.liveCharge(sessionId).orElseThrow();
            result = new NoShowResult(sid, "no_show", true, held.packageId(), held.sessionsRemaining(), null);
        } else {
            result = new NoShowResult(sid, "no_show", false, null, null, null);
        }
        log.info("session no-show trainer={} session={} charged={}", trainerId, sessionId, result.charged());
        return result;
    }

    // ── POST /v1/sessions/{id}/cancel ──────────────────────────────────────────

    /**
     * Cancel a booking and keep it in the diary. The client's start time is freed
     * ({@code uq_scheduled_session_client_start} skips cancelled rows).
     *
     * <p>{@code reason} ({@code trainer} · {@code client}, default trainer) is stored as {@code cancel_reason} (V2, R68),
     * so a re-pause can tell a hand cancel from one the pause made and never bring the first back.
     */
    @Transactional
    public SessionRow cancel(UUID trainerId, UUID sessionId, Map<String, Object> body) {
        if (body != null) {
            for (String key : body.keySet()) {
                if (!"reason".equals(key)) throw ApiException.validation(key + ": not a field this route takes");
            }
            Object reason = body.get("reason");
            if (reason != null && !(reason instanceof String r && CANCEL_REASONS.contains(r))) {
                throw ApiException.validation("reason: trainer or client");
            }
        }
        String reason = body != null && body.get("reason") instanceof String r ? r : "trainer";
        LockedSession s = lockLive(trainerId, sessionId);
        if ("cancelled".equals(s.status())) return row(trainerId, sessionId);
        if (!"scheduled".equals(s.status()) || s.started()) {
            throw settled("This session is " + describe(s) + ", so it can't be cancelled.");
        }
        repo.cancel(sessionId, reason);
        log.info("session cancelled trainer={} session={}", trainerId, sessionId);
        return row(trainerId, sessionId);
    }

    // ── POST /v1/sessions/{id}/reopen ──────────────────────────────────────────

    /**
     * Take back a done, no-show or cancel: the session is scheduled again, its log kept as it was, and a live charge
     * reversed — never deleted, so the pack's history shows both facts.
     */
    @Transactional
    public Reopened reopen(UUID trainerId, UUID sessionId, Map<String, Object> body) {
        noKeys(body);
        LockedSession s = lockLive(trainerId, sessionId);
        if ("scheduled".equals(s.status())) {
            return new Reopened(row(trainerId, sessionId), new ReopenEffects(false, null, null, false));
        }
        UUID clientId = UUID.fromString(s.clientId());
        if ("cancelled".equals(s.status())) {
            var client = repo.clientStanding(clientId).orElseThrow(SessionStateService::notFound);
            if ("archived".equals(client.status()) || "removed".equals(client.membershipStatus())) {
                throw ApiException.conflict("CLIENT_NOT_BOOKABLE",
                        "This client is " + ("removed".equals(client.membershipStatus()) ? "removed" : "archived")
                                + ", so the session can't be booked again.");
            }
            if (repo.startTaken(clientId, repo.scheduledAt(sessionId), sessionId)) throw timeTaken();
        }
        try {
            repo.reschedule(sessionId);
        } catch (DuplicateKeyException e) {
            // A cancelled session gave its start back; somebody took it since.
            throw timeTaken();
        }

        ReopenEffects effects = new ReopenEffects(false, null, null, false);
        if (s.liveCharge()) {
            var back = charges.reverse(sessionId);
            effects = new ReopenEffects(true, back.packageId(), back.sessionsRemaining(), back.reopened());
        }
        log.info("session reopened trainer={} session={} from={} chargeReversed={}",
                trainerId, sessionId, s.status(), effects.chargeReversed());
        return new Reopened(row(trainerId, sessionId), effects);
    }

    // ── helpers ────────────────────────────────────────────────────────────────

    private static void noKeys(Map<String, Object> body) {
        if (body != null && !body.isEmpty()) {
            throw ApiException.validation(body.keySet().iterator().next() + ": this route takes no fields");
        }
    }

    private static String describe(LockedSession s) {
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
