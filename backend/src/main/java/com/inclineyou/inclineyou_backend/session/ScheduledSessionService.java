package com.inclineyou.inclineyou_backend.session;

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
            String deliveryMode,
            /*
             * What this session should cost the client's pack: -1 or 0.
             *
             * Until this existed, `POST /v1/sessions/{id}/done` was the ONLY
             * endpoint anywhere that touched `sessions_remaining`, so a session
             * marked `no_show` over REST wrote a status and nothing else. The
             * phone has never behaved that way — `markNotTrained` settles the
             * pack in the same write, and `no_show` costs a session there.
             *
             * It is a request field rather than a rule the server applies to
             * `no_show` on its own, and that is the decision this closes: whether
             * a missed session burns one is a commercial question the trainer
             * settles with the client, not an invariant. The server's job is to
             * make the answer *expressible* and to make it exact however many
             * times it is asked.
             *
             * null leaves the pack alone, so every caller that predates this —
             * every reschedule, every note edit — is unaffected.
             */
            Integer packDelta
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
            long updatedAt,
            /*
             * V10's `pack_delta` / `pack_package_id` — what this session took and
             * from which pack. 0 and null mean it cost nothing.
             *
             * Appended because writing `packDelta` without being able to read it
             * back is only half an answer: a no-show that found no chargeable
             * pack settles at 0, and the diary has to draw "Marked no-show" and
             * "Marked no-show · pack −1" as the different facts they are. It is
             * also what tells a caller whether there is a charge left to undo.
             *
             * APPENDED LAST.
             */
            Integer packDelta,
            String packPackageId
    ) {}

    /** The one row of columns every read of this table selects. */
    private static final String SESSION_COLUMNS =
            "id::text, client_id::text, program_id::text, scheduled_at, duration_minutes, " +
            "status, notes, day_label, template_day, delivery_mode, created_at, updated_at, " +
            "pack_delta, pack_package_id::text AS pack_package_id";

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
                now.toEpochMilli(), now.toEpochMilli(), null, null);
    }

    // ── Get ───────────────────────────────────────────────────────────────────

    public SessionResponse get(UUID id, UUID trainerId) {
        return toResponse(findOwned(id, trainerId));
    }

    // ── Update ────────────────────────────────────────────────────────────────

    @Transactional
    public SessionResponse update(UUID id, UUID trainerId, UpdateRequest req) {
        var current = findOwned(id, trainerId);

        var setClauses = new ArrayList<String>();
        var p = new HashMap<String, Object>();
        p.put("id",  id.toString());
        p.put("tid", trainerId.toString());
        p.put("now", Timestamp.from(Instant.now()));
        setClauses.add("updated_at = :now");

        if (req.scheduledAt() != null) {
            p.put("scheduledAt", Timestamp.from(Instant.ofEpochMilli(req.scheduledAt())));
            setClauses.add("scheduled_at = :scheduledAt");
            /*
             * A MOVED SESSION IS NO LONGER THE RHYTHM · V3.
             *
             * `DiaryService` may delete and re-lay the rows it wrote from the
             * client's standing week. A trainer who has deliberately dragged
             * Thursday's 6am to 7pm must not have that undone the next time
             * anything else about the client changes — the next pack sold, the
             * next plan assigned, a fourth training day added. The move is what
             * makes the session theirs rather than the pattern's.
             *
             * Only on a MOVE. A status flip, a note, a duration change and a
             * delivery-mode switch all leave the row on its standing slot, so it
             * stays the rhythm's and stays maintained by it.
             */
            setClauses.add("from_schedule = FALSE");
        }
        if (req.durationMinutes() != null) { p.put("durationMinutes", req.durationMinutes()); setClauses.add("duration_minutes = :durationMinutes"); }
        if (req.status() != null)          { p.put("status",           req.status());          setClauses.add("status = :status"); }
        if (req.notes() != null)           { p.put("notes",            req.notes());           setClauses.add("notes = :notes"); }
        // Empty string clears the override and hands the session back to its
        // client's usual mode — the same "empty means clear" rule the trainer
        // profile endpoint uses.
        if (req.deliveryMode() != null)    { p.put("deliveryMode", deliveryMode(req.deliveryMode())); setClauses.add("delivery_mode = :deliveryMode"); }

        /*
         * The money, settled in the same statement as the status.
         *
         * Same transaction and same UPDATE deliberately: a pack decremented by a
         * request whose status write then failed is a session charged for and
         * not recorded, which is the shape nobody ever finds.
         */
        if (req.packDelta() != null) {
            String status = req.status() != null ? req.status() : str(current.get("status"));
            var settled = settlePack(id, trainerId, str(current.get("client_id")),
                                     req.packDelta(), status);
            p.put("delta",  settled.delta());
            p.put("packId", settled.packageId());
            setClauses.add("pack_delta = :delta");
            setClauses.add("pack_package_id = :packId::uuid");
            setClauses.add("pack_applied_at = NOW()");
        }

        jdbc.update("UPDATE scheduled_session SET " + String.join(", ", setClauses) +
                " WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL", p);

        return toResponse(findOwned(id, trainerId));
    }

    // ── Settling a session against its pack ───────────────────────

    /** What to stamp on the session once the pack has been moved. */
    private record PackSettlement(int delta, String packageId) {}

    /**
     * Settles a session against its pack <b>from whatever it has already
     * taken</b> — the server's copy of the phone's {@code settlePack}, quadrant
     * for quadrant, because two writers of one balance that disagree are how a
     * client gets charged twice:
     *
     * <ul>
     *   <li>already charged and still should be — nothing moves, and the ORIGINAL
     *       stamp is kept, so an undo still credits the pack it took from;</li>
     *   <li>charged but shouldn't be — put it back;</li>
     *   <li>not charged and should be — take one;</li>
     *   <li>not charged and shouldn't be — nothing moves.</li>
     * </ul>
     *
     * <p>The first quadrant is the load-bearing one. Closing a session is not a
     * one-way door — it can be finished from the log, from the diary, from its
     * detail screen, and re-decided afterwards — and every one of those paths
     * used to subtract one more. A twelve-session pack with one session delivered
     * could read nine.
     *
     * <p>Re-charging deliberately reuses the pack the session was first charged
     * to rather than searching again: a re-decision must not migrate somebody's
     * session onto a pack they bought later.
     */
    private PackSettlement settlePack(UUID sessionId, UUID trainerId, String clientId,
                                      int requested, String status) {
        /*
         * -1 or 0, and nothing else. A route that can set an arbitrary delta is
         * the "more general answer and the more dangerous one" the web's gap list
         * argued against for `PATCH /v1/packages/{id}`: it can silently undo a
         * charge that the 24-hour undo exists to reverse properly, and it can
         * bill four sessions for one no-show.
         */
        if (requested != 0 && requested != -1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "packDelta must be -1 or 0");
        }
        /*
         * Only the not-trained outcomes. `done` owns its own charge in
         * `markDone`, which also opens the workout log — letting this route
         * charge a done session would give that outcome two front doors and put
         * us straight back in the double-charge shape above. `cancelled` is in
         * because the refund quadrant is exactly what a done-then-cancelled
         * session needs; it will normally arrive with a delta of 0.
         */
        if (!"no_show".equals(status) && !"cancelled".equals(status)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "packDelta applies to a no_show or cancelled session; " +
                    "use POST /v1/sessions/{id}/done to close one");
        }

        boolean wantsCharge = requested != 0;
        String tid = trainerId.toString();

        var stamped = jdbc.queryForList("""
                SELECT pack_delta, pack_package_id::text AS pack_package_id
                FROM scheduled_session
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                FOR UPDATE
                """, Map.of("id", sessionId.toString(), "tid", tid));
        Object priorRaw = stamped.isEmpty() ? null : stamped.get(0).get("pack_delta");
        String priorPackId = stamped.isEmpty() ? null : str(stamped.get(0).get("pack_package_id"));
        int prior = priorRaw == null ? 0 : ((Number) priorRaw).intValue();
        boolean charged = priorPackId != null && prior != 0;

        if (charged && wantsCharge) {
            return new PackSettlement(prior, priorPackId);
        }

        if (charged) {
            /*
             * Give it back — to the pack that was charged, found by the id
             * stamped on the session and not by searching again.
             *
             * Neither `status` nor `paused_at` is in this WHERE, and both
             * omissions are deliberate: the pause gates the CHARGE and nothing
             * else, and a pack that has since completed still has to accept back
             * the session it was wrongly billed for. `LEAST` keeps the credit
             * inside the pack's own total, which is the same ceiling the phone's
             * repair pass refuses to go past.
             */
            jdbc.update("""
                    UPDATE package SET
                        sessions_remaining = LEAST(
                            COALESCE(sessions_total, sessions_remaining - :prior),
                            sessions_remaining - :prior),
                        updated_at = NOW()
                    WHERE id = :packId::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                      -- Only a pack that counts sessions. The charge could only
                      -- ever have come off one with a number on it, and `LEAST`
                      -- ignores nulls — so without this a pack whose count was
                      -- cleared since would be credited its whole total back.
                      AND sessions_remaining IS NOT NULL
                    """, Map.of("packId", priorPackId, "tid", tid, "prior", prior));
            return new PackSettlement(0, null);
        }

        if (!wantsCharge) {
            return new PackSettlement(0, null);
        }

        // Not charged, and should be. The predicate is markDone's, `paused_at`
        // included: a client on holiday is not billed for missing a session they
        // were never going to attend.
        var taken = jdbc.queryForList("""
                UPDATE package SET
                    sessions_remaining = GREATEST(0, sessions_remaining - 1),
                    updated_at = NOW()
                WHERE id = (
                    SELECT id FROM package
                    WHERE client_id = :cid::uuid AND trainer_id = :tid::uuid
                      AND type = 'session_pack' AND status = 'active'
                      AND sessions_remaining > 0 AND deleted_at IS NULL
                      AND paused_at IS NULL
                    ORDER BY created_at ASC
                    LIMIT 1
                )
                RETURNING id::text AS id
                """, Map.of("cid", clientId, "tid", tid));

        // Nothing chargeable — the session is marked and costs nothing, exactly
        // as it already does for a client with no pack at all. The zero is
        // stamped rather than left null so a later resume cannot bill it late.
        if (taken.isEmpty()) return new PackSettlement(0, null);
        return new PackSettlement(-1, str(taken.get(0).get("id")));
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
                          -- V30 · a paused pack is not chargeable.
                          --
                          -- THE ONE PLACE THE PAUSE HAS TO HOLD. `paused_at` is a
                          -- column and not a `status` value precisely so that
                          -- every other read — the deck, the money book, the
                          -- roster, `pack.activeClients` — keeps counting a
                          -- client who is in Kerala as the active client they
                          -- still are. This is the single predicate that pays for
                          -- that choice, and it is here rather than in a service
                          -- above so it holds however the session was marked.
                          --
                          -- A client with a paused pack and a second live one is
                          -- charged against the second, which is right: the
                          -- ORDER BY simply skips what cannot be charged. With
                          -- nothing chargeable the session is marked done for
                          -- free, exactly as it already is for a client with no
                          -- pack at all — and `pack_delta` records the zero, so
                          -- the resumed pack is not retroactively billed.
                          AND paused_at IS NULL
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
                toEpochMilli(r.get("updated_at")),
                (Integer) r.get("pack_delta"),
                str(r.get("pack_package_id")));
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
