package com.inclineyou.inclineyou_backend.core.session;

import com.inclineyou.inclineyou_backend.core.session.dto.BookRequest;
import com.inclineyou.inclineyou_backend.core.session.dto.Booked;
import com.inclineyou.inclineyou_backend.core.session.dto.NewSession;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;

/**
 * {@code POST /v1/sessions} — book one session on the v1 schema (api-contract Today A1, also the Schedule's booking
 * panel).
 *
 * <p>This route only books. A walk-in that is booked and started in one write is its own route
 * ({@code POST /v1/sessions/walk-in}, Log session), so what this one answers never depends on a flag in the body.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SessionBookingService {

    private final SessionJdbcRepository repo;
    private final SessionStateJdbcRepository states;
    private final SessionChargeService charges;

    private static final Set<String> MODES = Set.of("floor", "home_visit", "remote");
    /** When neither the request nor the client's schedule says how long. */
    private static final int FALLBACK_MINUTES = 60;
    private static final int MAX_NOTES = 2000;
    /** How far back a booking may be written (a session logged late) and how far ahead (a block booked early). */
    static final Duration MAX_PAST = Duration.ofDays(366);
    static final Duration MAX_AHEAD = Duration.ofDays(2 * 366);

    @Transactional
    public Booked book(UUID trainerId, BookRequest req) {
        if (req == null) throw ApiException.validation("body: required");
        UUID id = uuid(req.id(), "id");
        UUID clientId = uuid(req.clientId(), "clientId");
        if (clientId == null) throw ApiException.validation("clientId: required");
        if (req.scheduledAt() == null) throw ApiException.validation("scheduledAt: required (epoch ms)");
        // A whole minute: uq_scheduled_session_client_start compares exact instants, so 07:00:00.5 used to slip past
        // a booking at 07:00. Every time zone this product serves is a whole number of minutes from UTC.
        if (req.scheduledAt() % 60_000 != 0) throw ApiException.validation("scheduledAt: a whole minute, no seconds");
        Instant now = Instant.now();
        if (req.scheduledAt() < now.minus(MAX_PAST).toEpochMilli() || req.scheduledAt() > now.plus(MAX_AHEAD).toEpochMilli()) {
            throw ApiException.validation("scheduledAt: within a year back and two years ahead");
        }
        if (req.durationMinutes() != null && (req.durationMinutes() < 1 || req.durationMinutes() > 480)) {
            throw ApiException.validation("durationMinutes: between 1 and 480");
        }
        if (req.deliveryMode() != null && !MODES.contains(req.deliveryMode())) {
            throw ApiException.validation("deliveryMode: floor, home_visit or remote");
        }
        String notes = req.notes() == null || req.notes().isBlank() ? null : req.notes().strip();
        if (notes != null && notes.length() > MAX_NOTES) {
            throw ApiException.validation("notes: at most " + MAX_NOTES + " characters");
        }
        UUID workoutId = uuid(req.workoutId(), "workoutId");
        var billing = SessionBillingRules.read(req.billing(), req.price());

        var client = repo.lockClient(trainerId, clientId)
                .orElseThrow(() -> ApiException.notFound("That client is not on your roster."));

        // A replay answers with what the first call made; the same id anywhere else is a clash, and says nothing more.
        // AFTER the lock: a double tap's second request waits here for the first to commit, then sees its row and
        // answers 200. Checked before the lock, it saw nothing, waited, and hit the primary key: 409 for a booking
        // that had worked. Before the bookable check, so a replay still answers after a pause landed in between.
        var replay = replay(trainerId, clientId, id);
        if (replay != null) return replay;
        // A 409, not a 422: it depends on the client's current state, and the same request works after a resume.
        if ("paused".equals(client.status()) || "archived".equals(client.status()) || "removed".equals(client.membershipStatus())) {
            throw ApiException.conflict("CLIENT_NOT_BOOKABLE",
                    "This client is " + ("removed".equals(client.membershipStatus()) ? "removed" : client.status())
                            + ", so they can't be booked.");
        }

        if ("single".equals(billing.billing()) && "gym".equals(client.clientType())) throw SessionBillingRules.gymClientSingle();

        Instant at = Instant.ofEpochMilli(req.scheduledAt());
        int minutes = req.durationMinutes() != null ? req.durationMinutes()
                : client.sessionDurationMinutes() != null ? client.sessionDurationMinutes()
                : FALLBACK_MINUTES;

        UUID workout;
        if (workoutId != null) {
            // Anything else is a 400 on the field — never a way to learn another trainer's workout exists.
            if (!repo.workoutGivable(trainerId, clientId, workoutId)) {
                throw ApiException.validation("workoutId: not a workout this client can be given");
            }
            workout = workoutId;
        } else {
            // The next workout of the active program, so the panel needs no program-workouts read of its own. A plan
            // whose last workout has already been booked gets none: the session is booked unplanned rather than
            // silently restarting week 1, which is a decision for the trainer.
            workout = repo.nextWorkout(clientId, at).orElse(null);
        }

        // One person cannot be in two sessions: a booking that overlaps one of THIS client's own (any status but
        // cancelled) is refused. An overlap with another client is deliberately allowed — semi-private training, two
        // clients on the floor at once — and the panel warns about it (contract Today A1).
        var clash = repo.clientClash(clientId, at, minutes);
        if (clash.isPresent()) {
            if (clash.get().equals(at)) throw timeTaken();
            throw ApiException.conflict("SESSION_CLIENT_OVERLAP",
                    "This client already has a session then. Pick a time after it ends, or move that one first.");
        }

        UUID sid = id == null ? UUID.randomUUID() : id;
        try {
            repo.insert(new NewSession(sid, trainerId, clientId, at, minutes, workout, req.deliveryMode(), notes,
                    billing.billing(), billing.price()));
        } catch (DuplicateKeyException e) {
            String msg = String.valueOf(e.getMostSpecificCause().getMessage());
            if (msg.contains("uq_scheduled_session_client_start")) throw timeTaken();
            // The primary key: a row with this id committed after the check above (it cannot, under the client lock,
            // for this client) or one this trainer cannot see.
            var late = replay(trainerId, clientId, id);
            if (late != null) return late;
            throw ApiException.idConflict();
        }
        // A single session sells itself when it is booked (10 Nov 2026): the client owes for it, due on its day.
        if ("single".equals(billing.billing())) {
            charges.sellAtBooking(trainerId, clientId, sid, states.lock(trainerId, sid).orElseThrow().service());
        }
        log.info("session booked trainer={} client={} session={} workoutPicked={}",
                trainerId, clientId, sid, workoutId == null && workout != null);
        return new Booked(repo.one(trainerId, sid).orElseThrow(), true);
    }

    /** The first call's answer for a retried id (200), a 409 for an id that is somebody else's, null for a new id. */
    private Booked replay(UUID trainerId, UUID clientId, UUID id) {
        if (id == null) return null;
        var existing = repo.ownerOf(id);
        if (existing.isEmpty()) return null;
        var e = existing.get();
        if (trainerId.toString().equals(e.trainerId()) && clientId.toString().equals(e.clientId())) {
            return new Booked(repo.one(trainerId, id).orElseThrow(ApiException::idConflict), false);
        }
        throw ApiException.idConflict();
    }

    private static ApiException timeTaken() {
        return ApiException.conflict("SESSION_CLIENT_TIME_TAKEN", "This client already has a session at that time.");
    }

    private static UUID uuid(String raw, String field) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return UUID.fromString(raw.strip());
        } catch (IllegalArgumentException e) {
            throw ApiException.validation(field + ": not an id");
        }
    }
}
