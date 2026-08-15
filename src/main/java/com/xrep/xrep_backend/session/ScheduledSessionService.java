package com.xrep.xrep_backend.session;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class ScheduledSessionService {

    private final NamedParameterJdbcTemplate jdbc;

    // ── DTOs ──────────────────────────────────────────────────────────────────

    public record CreateRequest(
            @NotNull Long scheduledAt,
            @NotBlank String clientId,
            String programId,
            Integer durationMinutes,
            String notes,
            String dayLabel,
            Integer templateDay,
            /** 'floor' | 'remote'. Null means "use whatever this client usually does". */
            String deliveryMode
    ) {}

    public record UpdateRequest(
            Long scheduledAt,
            Integer durationMinutes,
            String status,
            String notes,
            String deliveryMode
    ) {}

    public record MarkDoneRequest(
            String workoutNotes,
            String sessionDate  // ISO "yyyy-MM-dd"; defaults to today if blank
    ) {}

    public record SessionResponse(
            String id,
            String clientId,
            String programId,
            long scheduledAt,
            Integer durationMinutes,
            String status,
            String notes,
            String dayLabel,
            Integer templateDay,
            String deliveryMode,
            long createdAt,
            long updatedAt
    ) {}

    /** The one row of columns every read of this table selects. */
    private static final String SESSION_COLUMNS =
            "id::text, client_id::text, program_id::text, scheduled_at, duration_minutes, " +
            "status, notes, day_label, template_day, delivery_mode, created_at, updated_at";

    // ── List ──────────────────────────────────────────────────────────────────

    public List<SessionResponse> list(UUID trainerId, String clientId, Long from, Long to) {
        var conditions = new ArrayList<String>();
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        conditions.add("trainer_id = :tid::uuid");
        conditions.add("deleted_at IS NULL");

        if (clientId != null && !clientId.isBlank()) {
            p.put("cid", clientId);
            conditions.add("client_id = :cid::uuid");
        }
        if (from != null) {
            p.put("from", Timestamp.from(Instant.ofEpochMilli(from)));
            conditions.add("scheduled_at >= :from");
        }
        if (to != null) {
            p.put("to", Timestamp.from(Instant.ofEpochMilli(to)));
            conditions.add("scheduled_at <= :to");
        }

        var rows = jdbc.queryForList(
                "SELECT " + SESSION_COLUMNS +
                " FROM scheduled_session WHERE " + String.join(" AND ", conditions) +
                " ORDER BY scheduled_at ASC", p);
        return rows.stream().map(this::toResponse).toList();
    }

    // ── Create ────────────────────────────────────────────────────────────────

    @Transactional
    public SessionResponse create(UUID trainerId, CreateRequest req) {
        Boolean owned = jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM client WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)",
                Map.of("cid", req.clientId(), "tid", trainerId.toString()), Boolean.class);
        if (!Boolean.TRUE.equals(owned)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Client not found");
        }

        UUID id = UUID.randomUUID();
        Instant now = Instant.now();
        Timestamp scheduledAt = Timestamp.from(Instant.ofEpochMilli(req.scheduledAt()));

        var p = new HashMap<String, Object>();
        p.put("id",              id.toString());
        p.put("tid",             trainerId.toString());
        p.put("cid",             req.clientId());
        p.put("programId",       req.programId());
        p.put("scheduledAt",     scheduledAt);
        p.put("durationMinutes", req.durationMinutes());
        p.put("notes",           req.notes());
        p.put("dayLabel",        req.dayLabel());
        p.put("templateDay",     req.templateDay());
        p.put("deliveryMode",    deliveryMode(req.deliveryMode()));
        p.put("now",             Timestamp.from(now));

        jdbc.update("""
                INSERT INTO scheduled_session (id, trainer_id, client_id, program_id, scheduled_at,
                    duration_minutes, notes, day_label, template_day, delivery_mode, created_at, updated_at)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, :programId::uuid, :scheduledAt,
                    :durationMinutes, :notes, :dayLabel, :templateDay, :deliveryMode, :now, :now)
                """, p);

        return new SessionResponse(id.toString(), req.clientId(), req.programId(),
                req.scheduledAt(), req.durationMinutes(), "scheduled", req.notes(),
                req.dayLabel(), req.templateDay(), deliveryMode(req.deliveryMode()),
                now.toEpochMilli(), now.toEpochMilli());
    }

    // ── Get ───────────────────────────────────────────────────────────────────

    public SessionResponse get(UUID id, UUID trainerId) {
        return toResponse(findOwned(id, trainerId));
    }

    // ── Update ────────────────────────────────────────────────────────────────

    @Transactional
    public SessionResponse update(UUID id, UUID trainerId, UpdateRequest req) {
        findOwned(id, trainerId);

        var setClauses = new ArrayList<String>();
        var p = new HashMap<String, Object>();
        p.put("id",  id.toString());
        p.put("tid", trainerId.toString());
        p.put("now", Timestamp.from(Instant.now()));
        setClauses.add("updated_at = :now");

        if (req.scheduledAt() != null) {
            p.put("scheduledAt", Timestamp.from(Instant.ofEpochMilli(req.scheduledAt())));
            setClauses.add("scheduled_at = :scheduledAt");
        }
        if (req.durationMinutes() != null) { p.put("durationMinutes", req.durationMinutes()); setClauses.add("duration_minutes = :durationMinutes"); }
        if (req.status() != null)          { p.put("status",           req.status());          setClauses.add("status = :status"); }
        if (req.notes() != null)           { p.put("notes",            req.notes());           setClauses.add("notes = :notes"); }
        // Empty string clears the override and hands the session back to its
        // client's usual mode — the same "empty means clear" rule the trainer
        // profile endpoint uses.
        if (req.deliveryMode() != null)    { p.put("deliveryMode", deliveryMode(req.deliveryMode())); setClauses.add("delivery_mode = :deliveryMode"); }

        jdbc.update("UPDATE scheduled_session SET " + String.join(", ", setClauses) +
                " WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL", p);

        return toResponse(findOwned(id, trainerId));
    }

    // ── Delete ────────────────────────────────────────────────────────────────

    @Transactional
    public void delete(UUID id, UUID trainerId) {
        findOwned(id, trainerId);
        jdbc.update("""
                UPDATE scheduled_session SET deleted_at = NOW(), updated_at = NOW()
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("id", id.toString(), "tid", trainerId.toString()));
    }

    // ── Mark done ─────────────────────────────────────────────────────────────

    /**
     * Closes a session: marks it done, opens its workout log, and takes one off
     * the pack — each of those at most once, however many times this is called.
     *
     * Every step here used to be unconditional. Calling this twice on the same
     * session set `done` twice (harmless), inserted a SECOND workout_session for
     * it (not harmless), and subtracted from the pack again (somebody's money).
     * A twelve-session pack with one session delivered could read nine.
     *
     * It is not enough that the current app no longer calls this — the route is
     * live, an older build on somebody's phone still posts to it, and the app
     * writes the same outcome locally and syncs it up. Two paths to one outcome
     * is exactly the shape that double-charges, so this now mirrors the client's
     * `settlePack`: what the session ALREADY took decides what it takes now.
     *
     * `pack_delta` / `pack_package_id` / `pack_applied_at` (V10) are stamped, so
     * the diary's 24-hour undo can reverse a session closed here as exactly as
     * one closed on the device. Not stamping them was the subtler half of the
     * bug: an unstamped session looks untouched, so the device charges for it
     * again on the next sync.
     */
    @Transactional
    public Map<String, Object> markDone(UUID sessionId, UUID trainerId, MarkDoneRequest req) {
        var session = findOwned(sessionId, trainerId);
        String clientId = str(session.get("client_id"));
        Object programIdRaw = session.get("program_id");
        String programId = programIdRaw != null ? programIdRaw.toString() : null;
        String tid = trainerId.toString();
        var idParams = Map.<String, Object>of("id", sessionId.toString(), "tid", tid);

        // ── What this session has already taken ──────────────────────────────
        var stamped = jdbc.queryForList("""
                SELECT pack_delta, pack_package_id::text AS pack_package_id
                FROM scheduled_session
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                FOR UPDATE
                """, idParams);
        Object priorDelta = stamped.isEmpty() ? null : stamped.get(0).get("pack_delta");
        String priorPackId = stamped.isEmpty() ? null : str(stamped.get(0).get("pack_package_id"));
        boolean alreadyCharged =
                priorPackId != null && priorDelta != null && ((Number) priorDelta).intValue() != 0;

        // ── The pack ─────────────────────────────────────────────────────────
        // Skipped entirely when this session has already paid. `RETURNING` is
        // what makes the charge attributable: without knowing WHICH pack was
        // decremented there is nothing to stamp, and nothing to undo against.
        String chargedPackId = priorPackId;
        int delta = alreadyCharged ? ((Number) priorDelta).intValue() : 0;

        if (!alreadyCharged) {
            var charged = jdbc.queryForList("""
                    UPDATE package SET
                        sessions_remaining = GREATEST(0, sessions_remaining - 1),
                        updated_at = NOW()
                    WHERE id = (
                        SELECT id FROM package
                        WHERE client_id = :cid::uuid AND trainer_id = :tid::uuid
                          AND type = 'session_pack' AND status = 'active'
                          AND sessions_remaining > 0 AND deleted_at IS NULL
                        ORDER BY created_at ASC
                        LIMIT 1
                    )
                    RETURNING id::text AS id
                    """, Map.of("cid", clientId, "tid", tid));
            chargedPackId = charged.isEmpty() ? null : str(charged.get(0).get("id"));
            delta = chargedPackId != null ? -1 : 0;
        }

        // ── The session ──────────────────────────────────────────────────────
        var ps = new HashMap<String, Object>();
        ps.put("id",     sessionId.toString());
        ps.put("tid",    tid);
        ps.put("delta",  delta);
        ps.put("packId", chargedPackId);
        jdbc.update("""
                UPDATE scheduled_session SET
                    status          = 'done',
                    pack_delta      = :delta,
                    pack_package_id = :packId::uuid,
                    pack_applied_at = NOW(),
                    updated_at      = NOW()
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, ps);

        // ── The workout log ──────────────────────────────────────────────────
        // Reused if one is already open against this session, matching the
        // client's `startSession`. A second log would split one session's sets
        // across two records and count the session twice in every report.
        var existing = jdbc.queryForList("""
                SELECT id::text AS id FROM workout_session
                WHERE scheduled_session_id = :id::uuid AND trainer_id = :tid::uuid
                  AND deleted_at IS NULL
                ORDER BY created_at ASC
                LIMIT 1
                """, idParams);
        if (!existing.isEmpty()) {
            return Map.of("workoutSessionId", str(existing.get(0).get("id")));
        }

        UUID workoutId = UUID.randomUUID();
        Instant now = Instant.now();
        String sessionDate = (req != null && req.sessionDate() != null && !req.sessionDate().isBlank())
                ? req.sessionDate()
                : java.time.LocalDate.now().toString();
        String workoutNotes = req != null ? req.workoutNotes() : null;

        var pw = new HashMap<String, Object>();
        pw.put("id",                 workoutId.toString());
        pw.put("tid",                tid);
        pw.put("cid",                clientId);
        pw.put("programId",          programId);
        pw.put("scheduledSessionId", sessionId.toString());
        pw.put("sessionDate",        java.sql.Date.valueOf(sessionDate));
        pw.put("notes",              workoutNotes);
        pw.put("now",                Timestamp.from(now));

        jdbc.update("""
                INSERT INTO workout_session (id, trainer_id, client_id, program_id, scheduled_session_id,
                    logged_by, session_date, notes, created_at, updated_at)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, :programId::uuid, :scheduledSessionId::uuid,
                    'trainer', :sessionDate, :notes, :now, :now)
                """, pw);

        return Map.of("workoutSessionId", workoutId.toString());
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Map<String, Object> findOwned(UUID id, UUID trainerId) {
        var rows = jdbc.queryForList(
                "SELECT " + SESSION_COLUMNS +
                " FROM scheduled_session WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL",
                Map.of("id", id.toString(), "tid", trainerId.toString()));
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Session not found");
        return rows.get(0);
    }

    private SessionResponse toResponse(Map<String, Object> r) {
        Object td = r.get("template_day");
        Integer templateDay = td instanceof Integer i ? i : (td != null ? Integer.parseInt(td.toString()) : null);
        return new SessionResponse(
                str(r.get("id")),
                str(r.get("client_id")),
                str(r.get("program_id")),
                toEpochMilli(r.get("scheduled_at")),
                (Integer) r.get("duration_minutes"),
                str(r.get("status")),
                str(r.get("notes")),
                str(r.get("day_label")),
                templateDay,
                str(r.get("delivery_mode")),
                toEpochMilli(r.get("created_at")),
                toEpochMilli(r.get("updated_at")));
    }

    private String str(Object v) { return v == null ? null : v.toString(); }

    /**
     * 'floor' | 'remote' | null. Unrecognised values become null rather than a
     * 400 — see the note on the same helper in SyncService.
     */
    private static String deliveryMode(String raw) {
        if (raw == null) return null;
        String value = raw.trim().toLowerCase();
        return value.equals("floor") || value.equals("remote") ? value : null;
    }

    private long toEpochMilli(Object v) {
        if (v instanceof java.sql.Timestamp ts)          return ts.toInstant().toEpochMilli();
        if (v instanceof java.time.OffsetDateTime odt)   return odt.toInstant().toEpochMilli();
        if (v instanceof java.time.LocalDateTime ldt)    return ldt.toInstant(java.time.ZoneOffset.UTC).toEpochMilli();
        if (v instanceof java.time.Instant i)            return i.toEpochMilli();
        return 0L;
    }
}
