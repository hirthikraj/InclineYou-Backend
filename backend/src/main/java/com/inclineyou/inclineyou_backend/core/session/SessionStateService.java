package com.inclineyou.inclineyou_backend.core.session;

import com.inclineyou.inclineyou_backend.core.session.dto.LockedSession;
import com.inclineyou.inclineyou_backend.core.session.dto.MarkResult;
import com.inclineyou.inclineyou_backend.core.session.dto.NoShowResult;
import com.inclineyou.inclineyou_backend.core.session.dto.ReopenEffects;
import com.inclineyou.inclineyou_backend.core.session.dto.Reopened;
import com.inclineyou.inclineyou_backend.core.session.dto.BillingResult;
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
    /** How long a single session's booking — and so its sale — can be undone (10 Nov 2026), as a sold pack's can. */
    static final int UNDO_WINDOW_MINUTES = 10;

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
     *
     * <p>Only within {@link #UNDO_WINDOW_MINUTES} of the BOOKING, whatever its billing (16 Nov 2026, the owner's rule:
     * Undo for ten minutes, then Cancel). It used to apply to a single session alone, counted from its sale: a pack
     * booking could be deleted at any age, so a session that happened last week and was never marked could vanish
     * without a trace and never be charged; and a booking switched to single today could be deleted though it was
     * weeks old. After the window: {@code 409 SESSION_UNDO_EXPIRED} — cancel it, which keeps it in the diary.
     */
    @Transactional
    public void delete(UUID trainerId, UUID sessionId) {
        var s = repo.lock(trainerId, sessionId).orElseThrow(SessionStateService::notFound);
        if (s.deleted()) return;
        if (!"scheduled".equals(s.status()) || s.started() || s.liveCharge()) {
            throw settled("This session already has a history, so it can't be removed. Cancel it instead.");
        }
        if (!s.undoable()) {
            throw ApiException.conflict("SESSION_UNDO_EXPIRED", "It's been more than " + UNDO_WINDOW_MINUTES
                    + " minutes since this session was booked. Cancel it instead.");
        }
        // A single session sold itself when it was booked (10 Nov 2026): Undo takes the booking and the sale back
        // together, before any money moved; after that the session is cancelled, which asks whether to charge it.
        var sale = charges.sale(sessionId);
        if (sale.isPresent()) {
            var k = sale.get();
            if (k.hasMoney()) {
                throw ApiException.conflict("SESSION_SALE_PAID",
                        "Money was recorded on this session, so it can't be undone. Cancel it instead.");
            }
            repo.dropSale(UUID.fromString(k.id()));
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
        // One person cannot be in two sessions (16 Nov 2026): a move, or a longer length, that overlaps another of THIS
        // client's sessions is refused as booking refuses it. Another client at that hour stays allowed.
        if (edit.scheduledAt() != null || edit.durationMinutes() != null) {
            var now = repo.timing(sessionId);
            Instant at = edit.scheduledAt() != null ? edit.scheduledAt().value() : now.getKey();
            int minutes = edit.durationMinutes() != null ? edit.durationMinutes().value() : now.getValue();
            if (reads.clientClash(UUID.fromString(s.clientId()), at, minutes, sessionId).isPresent()) {
                throw ApiException.conflict("SESSION_CLIENT_OVERLAP",
                        "This client already has a session then. Pick a time after it ends, or move that one first.");
            }
        }
        try {
            repo.edit(sessionId, edit);
        } catch (DuplicateKeyException e) {
            throw timeTaken();
        }
        // A single session's sale is due on the session's day: a move takes it along (10 Nov 2026).
        if (edit.scheduledAt() != null) {
            charges.sale(sessionId).ifPresent(k ->
                    repo.moveSale(UUID.fromString(k.id()), repo.billing(sessionId).orElseThrow().day()));
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
            // Booking's rules, so a move cannot do what a booking may not (16 Nov 2026): a whole minute —
            // uq_scheduled_session_client_start compares exact instants, so 07:00:00.5 slipped past a 07:00 — and a
            // year back to two years ahead, so a typo for 3026 or 1970 cannot send a session off the calendar.
            long ms = n.longValue();
            if (ms % 60_000 != 0) throw ApiException.validation("scheduledAt: a whole minute, no seconds");
            Instant now = Instant.now();
            if (ms < now.minus(SessionBookingService.MAX_PAST).toEpochMilli()
                    || ms > now.plus(SessionBookingService.MAX_AHEAD).toEpochMilli()) {
                throw ApiException.validation("scheduledAt: within a year back and two years ahead");
            }
            at = Patch.of(Instant.ofEpochMilli(ms));
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
            charges.close(sessionId);   // a single session's sale: nothing owed for a no-show not charged
            result = new NoShowResult(sid, "no_show", false, back.packageId(), back.sessionsRemaining(), null);
        } else if (s.liveCharge()) {
            var held = repo.liveCharge(sessionId).orElseThrow();
            result = new NoShowResult(sid, "no_show", true, held.packageId(), held.sessionsRemaining(), null);
        } else {
            if (!charge) charges.close(sessionId);   // as above, for a single session never charged
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
        boolean charge = false;
        if (body != null) {
            for (String key : body.keySet()) {
                if (!"reason".equals(key) && !"charge".equals(key)) {
                    throw ApiException.validation(key + ": not a field this route takes");
                }
            }
            Object reason = body.get("reason");
            if (reason != null && !(reason instanceof String r && CANCEL_REASONS.contains(r))) {
                throw ApiException.validation("reason: trainer or client");
            }
            Object c = body.get("charge");
            if (c != null && !(c instanceof Boolean)) throw ApiException.validation("charge: true or false");
            charge = Boolean.TRUE.equals(c);
        }
        String reason = body != null && body.get("reason") instanceof String r ? r : "trainer";
        LockedSession s = lockLive(trainerId, sessionId);
        if ("cancelled".equals(s.status())) return row(trainerId, sessionId);
        if (!"scheduled".equals(s.status()) || s.started()) {
            throw settled("This session is " + describe(s) + ", so it can't be cancelled.");
        }
        // charge (10 Nov 2026, default false): a late cancel the trainer charges for — a pack session costs one
        // session, a single one keeps its sale owed. Not charged, a single session's sale is closed: nothing owed.
        // The charge is taken before the status changes, the order a no-show takes too.
        if (charge) charges.charge(trainerId, UUID.fromString(s.clientId()), sessionId, s.service());
        repo.cancel(sessionId, reason);
        if (!charge) charges.close(sessionId);
        log.info("session cancelled trainer={} session={} charged={}", trainerId, sessionId, charge);
        return row(trainerId, sessionId);
    }

    // ── POST /v1/sessions/{id}/billing ─────────────────────────────────────────

    /**
     * Change how a session is paid for (V32) — {@code {billing, price}}, the same reading booking makes.
     *
     * <p>Before delivery it only records the choice; Mark done does the charging, as always. On a session already
     * delivered and not charged, it settles it now: {@code single} sells it and charges the sale, {@code pack} tries
     * the live pack again (a pack sold since), and {@code trial} / {@code complimentary} take it off the money still to
     * chase. A session that already carries a charge is refused — reopen it first, so the charge is reversed in the
     * open rather than swapped behind the trainer's back. Sending what it already is answers 200 and changes nothing.
     * A no-show is never charged from here: whether it costs a session is the no-show's own question.
     */
    @Transactional
    public BillingResult billing(UUID trainerId, UUID sessionId, Map<String, Object> body) {
        if (body == null) throw ApiException.validation("billing: required");
        for (String key : body.keySet()) {
            if (!"billing".equals(key) && !"price".equals(key)) {
                throw ApiException.validation(key + ": not a field this route takes");
            }
        }
        if (!(body.get("billing") instanceof String b)) throw ApiException.validation("billing: required");
        Object rawPrice = body.get("price");
        if (rawPrice != null && !(rawPrice instanceof String)) {
            throw ApiException.validation("price: a decimal string, like \"800.00\"");
        }
        var want = SessionBillingRules.read(b, (String) rawPrice);

        LockedSession s = lockLive(trainerId, sessionId);
        if ("cancelled".equals(s.status())) {
            throw ApiException.conflict("SESSION_CANCELLED", "This session was cancelled. Reopen it first.");
        }
        var now = repo.billing(sessionId).orElseThrow(SessionStateService::notFound);
        boolean same = now.billing().equals(want.billing())
                && (now.price() == null ? want.price() == null
                    : want.price() != null && now.price().compareTo(want.price()) == 0);
        if (s.liveCharge()) {
            if (same) {
                var held = repo.liveCharge(sessionId).orElseThrow();
                return new BillingResult(row(trainerId, sessionId), false, held.packageId(), held.sessionsRemaining(), null);
            }
            throw ApiException.conflict("SESSION_CHARGED",
                    "This session is already charged. Reopen it first to change how it's paid for.");
        }
        if ("single".equals(want.billing()) && "gym".equals(now.clientType())) throw SessionBillingRules.gymClientSingle();
        if (!same) repo.setBilling(sessionId, want.billing(), want.price());

        BillingResult result;
        if (!same && !"done".equals(s.status())) {
            // Not delivered yet: a single session's sale follows the choice (10 Nov 2026) — made, repriced or dropped.
            charges.resell(trainerId, UUID.fromString(s.clientId()), sessionId, s.service(), want.billing(), want.price());
        }
        if ("done".equals(s.status())) {
            var c = charges.charge(trainerId, UUID.fromString(s.clientId()), sessionId, s.service());
            result = new BillingResult(row(trainerId, sessionId), c.charged(), c.packageId(), c.sessionsRemaining(),
                    c.charged() ? null : c.reason());
        } else {
            result = new BillingResult(row(trainerId, sessionId), false, null, null, null);
        }
        log.info("session billing trainer={} session={} billing={} charged={}", trainerId, sessionId,
                want.billing(), result.charged());
        return result;
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
        } else {
            // A single session's sale closed by an uncharged cancel or no-show is owed again: it is booked again.
            charges.revive(sessionId);
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
