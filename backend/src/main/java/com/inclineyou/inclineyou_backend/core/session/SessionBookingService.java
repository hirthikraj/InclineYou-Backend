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

    private static final Set<String> MODES = Set.of("floor", "home_visit", "remote");
    /** When neither the request nor the client's schedule says how long. */
    private static final int FALLBACK_MINUTES = 60;
    private static final int MAX_NOTES = 2000;

    @Transactional
    public Booked book(UUID trainerId, BookRequest req) {
        if (req == null) throw ApiException.validation("body: required");
        UUID id = uuid(req.id(), "id");
        UUID clientId = uuid(req.clientId(), "clientId");
        if (clientId == null) throw ApiException.validation("clientId: required");
        if (req.scheduledAt() == null) throw ApiException.validation("scheduledAt: required (epoch ms)");
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

        // A replay answers with what the first call made; the same id anywhere else is a clash, and says nothing more.
        if (id != null) {
            var existing = repo.ownerOf(id);
            if (existing.isPresent()) {
                var e = existing.get();
                if (trainerId.toString().equals(e.trainerId()) && clientId.toString().equals(e.clientId())) {
                    return new Booked(repo.one(trainerId, id).orElseThrow(ApiException::idConflict), false);
                }
                throw ApiException.idConflict();
            }
        }

        var client = repo.lockClient(trainerId, clientId)
                .orElseThrow(() -> ApiException.notFound("That client is not on your roster."));
        // A 409, not a 422: it depends on the client's current state, and the same request works after a resume.
        if ("paused".equals(client.status()) || "archived".equals(client.status()) || "removed".equals(client.membershipStatus())) {
            throw ApiException.conflict("CLIENT_NOT_BOOKABLE",
                    "This client is " + ("removed".equals(client.membershipStatus()) ? "removed" : client.status())
                            + ", so they can't be booked.");
        }

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

        UUID sid = id == null ? UUID.randomUUID() : id;
        try {
            repo.insert(new NewSession(sid, trainerId, clientId, at, minutes, workout, req.deliveryMode(), notes));
        } catch (DuplicateKeyException e) {
            String msg = String.valueOf(e.getMostSpecificCause().getMessage());
            if (msg.contains("uq_scheduled_session_client_start")) throw timeTaken();
            // The primary key: an id taken by a row this trainer cannot see.
            throw ApiException.idConflict();
        }
        log.info("session booked trainer={} client={} session={} workoutPicked={}",
                trainerId, clientId, sid, workoutId == null && workout != null);
        return new Booked(repo.one(trainerId, sid).orElseThrow(), true);
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
