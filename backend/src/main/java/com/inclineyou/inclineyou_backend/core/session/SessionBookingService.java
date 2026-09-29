package com.inclineyou.inclineyou_backend.core.session;

import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * {@code POST /v1/sessions} — book one session on the v1 schema (api-contract
 * Today A1, also the Schedule's booking panel).
 *
 * <p>This route only books. A walk-in that is booked and started in one write
 * is its own route ({@code POST /v1/sessions/walk-in}, Log session), so what
 * this one answers never depends on a flag in the body.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SessionBookingService {

    private final NamedParameterJdbcTemplate jdbc;
    private final SessionReadService reads;

    private static final Set<String> MODES = Set.of("floor", "home_visit", "remote");
    /** When neither the request nor the client's schedule says how long. */
    private static final int FALLBACK_MINUTES = 60;
    private static final int MAX_NOTES = 2000;

    /**
     * @param id              optional, client-minted, so a retried click books once
     * @param durationMinutes null = the client's {@code session_duration_minutes}
     * @param workoutId       null = the server picks the next workout in the active program
     * @param deliveryMode    null = the client's default; sent only when the trainer changed it
     */
    public record BookRequest(String id, String clientId, Long scheduledAt, Integer durationMinutes,
                              String workoutId, String deliveryMode, String notes) {}

    /** The session in the L4 shape, and whether this call made it (201) or found it (200). */
    public record Booked(SessionReadService.SessionRow session, boolean created) {}

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

        // A replay answers with what the first call made; the same id anywhere
        // else is a clash, and says nothing more.
        if (id != null) {
            var existing = jdbc.queryForList(
                    "SELECT trainer_id::text AS tid, client_id::text AS cid FROM scheduled_session WHERE id = :id::uuid",
                    Map.of("id", id.toString()));
            if (!existing.isEmpty()) {
                var e = existing.getFirst();
                if (trainerId.toString().equals(e.get("tid")) && clientId.toString().equals(e.get("cid"))) {
                    return new Booked(reads.one(trainerId, id).orElseThrow(ApiException::idConflict), false);
                }
                throw ApiException.idConflict();
            }
        }

        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("cid", clientId.toString());
        // Locked, so a pause or archive landing at the same moment is seen before
        // the booking, not after it.
        var clients = jdbc.queryForList("""
                SELECT c.status, c.membership_status, cs.session_duration_minutes
                FROM client c LEFT JOIN client_schedule cs ON cs.client_id = c.id
                WHERE c.id = :cid::uuid AND c.trainer_id = :tid::uuid AND c.deleted_at IS NULL
                FOR UPDATE OF c
                """, p);
        if (clients.isEmpty()) throw ApiException.notFound("That client is not on your roster.");
        var client = clients.getFirst();
        String status = (String) client.get("status");
        // A 409, not a 422: it depends on the client's current state, and the
        // same request works after a resume.
        if ("paused".equals(status) || "archived".equals(status) || "removed".equals(client.get("membership_status"))) {
            throw ApiException.conflict("CLIENT_NOT_BOOKABLE",
                    "This client is " + ("removed".equals(client.get("membership_status")) ? "removed" : status)
                            + ", so they can't be booked.");
        }

        Timestamp at = new Timestamp(req.scheduledAt());
        p.put("at", at);
        int minutes = req.durationMinutes() != null ? req.durationMinutes()
                : client.get("session_duration_minutes") instanceof Number n ? n.intValue()
                : FALLBACK_MINUTES;

        String workout = workoutId != null ? checkWorkout(p, workoutId) : nextWorkout(p);

        p.put("id", (id == null ? UUID.randomUUID() : id).toString());
        p.put("minutes", minutes);
        p.put("workout", workout);
        p.put("mode", req.deliveryMode());
        p.put("notes", notes);
        try {
            // ends_at is set_session_ends_at's, tenant_id is stamp_tenant_id's.
            jdbc.update("""
                    INSERT INTO scheduled_session (id, trainer_id, client_id, workout_id, scheduled_at,
                                                   duration_minutes, ends_at, delivery_mode, notes)
                    VALUES (:id::uuid, :tid::uuid, :cid::uuid, :workout::uuid, :at,
                            :minutes, :at, :mode, :notes)
                    """, p);
        } catch (DuplicateKeyException e) {
            String msg = String.valueOf(e.getMostSpecificCause().getMessage());
            if (msg.contains("uq_scheduled_session_client_start")) throw timeTaken();
            // The primary key: an id taken by a row this trainer cannot see.
            throw ApiException.idConflict();
        }
        UUID sid = UUID.fromString((String) p.get("id"));
        log.info("session booked trainer={} client={} session={} workoutPicked={}",
                trainerId, clientId, sid, workoutId == null && workout != null);
        return new Booked(reads.one(trainerId, sid).orElseThrow(), true);
    }

    private static ApiException timeTaken() {
        return ApiException.conflict("SESSION_CLIENT_TIME_TAKEN", "This client already has a session at that time.");
    }

    /**
     * An explicit workout must be one this client can be given: a day of their
     * own program, or a standalone workout off the trainer's shelf or the
     * InclineYou library. Anything else is a 400 on the field — never a way to
     * learn another trainer's workout exists.
     */
    private String checkWorkout(Map<String, Object> p, UUID workoutId) {
        p.put("wid", workoutId.toString());
        List<String> ok = jdbc.queryForList("""
                SELECT w.id::text FROM workout w
                LEFT JOIN program pr ON pr.id = w.program_id
                WHERE w.id = :wid::uuid AND w.deleted_at IS NULL
                  AND ((w.program_id IS NOT NULL AND pr.client_id = :cid::uuid AND pr.deleted_at IS NULL)
                       OR (w.program_id IS NULL AND (w.trainer_id = :tid::uuid OR w.origin = 'inclineyou')))
                """, p, String.class);
        if (ok.isEmpty()) throw ApiException.validation("workoutId: not a workout this client can be given");
        return ok.getFirst();
    }

    /**
     * The next workout in the client's active program, so the panel needs no
     * program-workouts read of its own.
     *
     * <p>"Next" is after the workout of the client's latest session booked before
     * this one that points into the same program, in the program's order (week,
     * day, position). No such session means the first workout. A plan whose last
     * workout has already been booked gets none: the session is booked unplanned
     * rather than silently restarting week 1, which is a decision for the trainer.
     */
    private String nextWorkout(Map<String, Object> p) {
        List<String> next = jdbc.queryForList("""
                WITH plan AS (
                    SELECT w.id, row_number() OVER (ORDER BY w.week, w.day, w.position, w.id) AS n
                    FROM program pr
                    JOIN workout w ON w.program_id = pr.id AND w.deleted_at IS NULL
                    WHERE pr.client_id = :cid::uuid AND pr.status = 'active' AND pr.deleted_at IS NULL
                ),
                last AS (
                    SELECT plan.n FROM scheduled_session s JOIN plan ON plan.id = s.workout_id
                    WHERE s.client_id = :cid::uuid AND s.deleted_at IS NULL AND s.status <> 'cancelled'
                      AND s.scheduled_at < :at
                    ORDER BY s.scheduled_at DESC, s.id DESC
                    LIMIT 1
                )
                SELECT plan.id::text FROM plan
                WHERE plan.n = coalesce((SELECT n FROM last), 0) + 1
                """, p, String.class);
        return next.isEmpty() ? null : next.getFirst();
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
