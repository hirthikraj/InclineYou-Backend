package com.inclineyou.inclineyou_backend.client;

import com.inclineyou.inclineyou_backend.exception.ApiException;
import com.inclineyou.inclineyou_backend.tenant.WorkspaceClock;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Pause, resume, archive and unarchive — api-contract 1.1 Clients A1–A3 and the
 * unarchive verb. Each answers {@code {client, effects}} (R72), and asking for the
 * state a client is already in is a 200 with zero effects, never an error.
 *
 * <p>What the verbs cancel they mark ({@code cancel_reason}, V2), so undoing one
 * brings back exactly those sessions and never one somebody called off by hand
 * (R70). Resume and unarchive restore the future sessions their own pause or
 * archive cancelled, then book the week onward (R21).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ClientStateService {

    private final NamedParameterJdbcTemplate jdbc;
    private final WorkspaceClock clock;
    private final ClientSummaryService summaries;
    private final ClientScheduleService schedules;

    /** The six reasons client_archive_reason allows. */
    private static final Set<String> ARCHIVE_REASONS =
            Set.of("goal_reached", "moved_away", "cost", "no_time", "switched_trainer", "other");
    /** How a pack paused by a client pause is told apart from one paused on its own. */
    private static final String PAUSE_REASON = "Client paused";

    public record Result(ClientSummaryService.ClientSummary client, Map<String, Integer> effects) {}

    // ── POST /v1/clients/{id}/pause ────────────────────────────────────────────

    @Transactional
    public Result pause(UUID trainerId, UUID clientId, Map<String, Object> body) {
        keys(body, Set.of("pausedUntil"));
        Object raw = body == null ? null : body.get("pausedUntil");
        if (raw != null && !(raw instanceof String)) throw ApiException.validation("pausedUntil: yyyy-MM-dd or null");
        LocalDate until = WorkspaceClock.parseDate((String) raw, "pausedUntil");

        var p = ClientScheduleService.params(trainerId, clientId);
        var client = schedules.lockClient(p);
        if ("archived".equals(client.get("status"))) throw ClientScheduleService.archived();
        ZoneId zone = clock.zone();
        p.put("tz", zone.getId());
        boolean already = "paused".equals(client.get("status"));
        LocalDate start = already
                ? ((Timestamp) client.get("paused_at")).toInstant().atZone(zone).toLocalDate()
                : WorkspaceClock.today(zone);
        if (until != null && until.isBefore(start)) {
            throw ApiException.validation("pausedUntil: before the pause starts");
        }
        var effects = effects("packagesPaused", "sessionsCancelled", "sessionsRestored");
        Object was = client.get("paused_until");
        if (already && java.util.Objects.equals(was == null ? null : was.toString(), until == null ? null : until.toString())) {
            return result(trainerId, clientId, effects);
        }

        p.put("until", until == null ? null : java.sql.Date.valueOf(until));
        if (already) {
            jdbc.update("UPDATE client SET paused_until = :until WHERE id = :cid::uuid", p);
        } else {
            jdbc.update("""
                    UPDATE client SET status = 'paused', paused_at = now(), paused_until = :until
                    WHERE id = :cid::uuid
                    """, p);
            // Every running pack stops its clock with the client (R19). The
            // adjustment's trigger sets package.paused_at; resume measures the days.
            p.put("reason", PAUSE_REASON);
            effects.put("packagesPaused", jdbc.update("""
                    INSERT INTO package_adjustment (trainer_id, package_id, client_id, kind, reason)
                    SELECT trainer_id, id, client_id, 'pause', :reason FROM package
                    WHERE client_id = :cid::uuid AND status = 'active' AND paused_at IS NULL AND deleted_at IS NULL
                    """, p));
        }
        // Inside the pause: from now to the start of the return day (or forever).
        String inside = "scheduled_at > now() AND (CAST(:until AS date) IS NULL"
                + " OR scheduled_at < (CAST(:until AS date)::timestamp AT TIME ZONE :tz))";
        effects.put("sessionsCancelled", jdbc.update("""
                UPDATE scheduled_session SET status = 'cancelled', cancel_reason = 'client_paused'
                WHERE client_id = :cid::uuid AND status = 'scheduled' AND started_at IS NULL AND deleted_at IS NULL
                  AND\s""" + inside, p));
        if (already) effects.put("sessionsRestored", restore(p, "client_paused", "scheduled_at > now() AND NOT (" + inside + ")"));
        log.info("client paused trainer={} client={} until={} effects={}", trainerId, clientId, until, effects);
        return result(trainerId, clientId, effects);
    }

    // ── POST /v1/clients/{id}/resume ───────────────────────────────────────────

    @Transactional
    public Result resume(UUID trainerId, UUID clientId, Map<String, Object> body) {
        keys(body, Set.of());
        var p = ClientScheduleService.params(trainerId, clientId);
        var client = schedules.lockClient(p);
        if ("archived".equals(client.get("status"))) throw ClientScheduleService.archived();
        var effects = effects("packagesResumed", "sessionsBooked");
        if (!"paused".equals(client.get("status"))) return result(trainerId, clientId, effects);

        jdbc.update("""
                UPDATE client SET status = 'active', paused_at = NULL, paused_until = NULL WHERE id = :cid::uuid
                """, p);
        p.put("reason", PAUSE_REASON);
        // Only the packs this client's pause stopped: one paused on its own stays paused.
        effects.put("packagesResumed", jdbc.update("""
                INSERT INTO package_adjustment (trainer_id, package_id, client_id, kind)
                SELECT k.trainer_id, k.id, k.client_id, 'resume' FROM package k
                WHERE k.client_id = :cid::uuid AND k.status = 'active' AND k.paused_at IS NOT NULL AND k.deleted_at IS NULL
                  AND EXISTS (SELECT 1 FROM package_adjustment a
                              WHERE a.package_id = k.id AND a.kind = 'pause' AND a.reason = :reason
                                AND a.effective_at >= k.paused_at)
                """, p));
        effects.put("sessionsBooked", rebook(trainerId, clientId, p, "client_paused", client));
        log.info("client resumed trainer={} client={} effects={}", trainerId, clientId, effects);
        return result(trainerId, clientId, effects);
    }

    // ── POST /v1/clients/{id}/archive ──────────────────────────────────────────

    @Transactional
    public Result archive(UUID trainerId, UUID clientId, Map<String, Object> body) {
        keys(body, Set.of("reason", "note"));
        Object reason = body == null ? null : body.get("reason");
        if (!(reason instanceof String r) || !ARCHIVE_REASONS.contains(r)) {
            throw ApiException.validation("reason: goal_reached, moved_away, cost, no_time, switched_trainer or other");
        }
        Object rawNote = body.get("note");
        if (rawNote != null && !(rawNote instanceof String)) throw ApiException.validation("note: text or null");
        String note = rawNote == null || ((String) rawNote).isBlank() ? null : ((String) rawNote).strip();
        if (note != null && note.length() > 200) throw ApiException.validation("note: at most 200 characters");

        var p = ClientScheduleService.params(trainerId, clientId);
        var client = schedules.lockClient(p);
        var effects = effects("sessionsCancelled", "packagesClosed", "packagesOwing");
        // The original reason and note are kept: changing them isn't a v1 action.
        if ("archived".equals(client.get("status"))) return result(trainerId, clientId, effects);

        p.put("reason", reason);
        p.put("note", note);
        jdbc.update("""
                UPDATE client SET status = 'archived', archived_at = now(), archive_reason = :reason, archive_note = :note,
                       paused_at = NULL, paused_until = NULL, membership_status = 'removed', removed_at = now()
                WHERE id = :cid::uuid
                """, p);
        effects.put("sessionsCancelled", jdbc.update("""
                UPDATE scheduled_session SET status = 'cancelled', cancel_reason = 'client_archived'
                WHERE client_id = :cid::uuid AND status = 'scheduled' AND started_at IS NULL
                  AND scheduled_at > now() AND deleted_at IS NULL
                """, p));
        // A pack with nothing owed closes; one still owed stays open, so Business keeps chasing it.
        var owing = jdbc.queryForList("""
                SELECT k.id::text AS id,
                       k.amount - coalesce((SELECT sum(y.amount) FROM payment y WHERE y.package_id = k.id
                                            AND y.deleted_at IS NULL AND y.status IN ('paid', 'write_off')), 0) AS due
                FROM package k WHERE k.client_id = :cid::uuid AND k.status = 'active' AND k.deleted_at IS NULL
                """, p);
        var close = new ArrayList<String>();
        int stillOwed = 0;
        for (var k : owing) {
            if (((java.math.BigDecimal) k.get("due")).signum() > 0) stillOwed++;
            else close.add((String) k.get("id"));
        }
        if (!close.isEmpty()) {
            p.put("close", close.toArray(String[]::new));
            jdbc.update("""
                    UPDATE package SET status = 'cancelled', closed_at = now() WHERE id = ANY(CAST(:close AS uuid[]))
                    """, p);
        }
        effects.put("packagesClosed", close.size());
        effects.put("packagesOwing", stillOwed);
        log.info("client archived trainer={} client={} reason={} effects={}", trainerId, clientId, reason, effects);
        return result(trainerId, clientId, effects);
    }

    // ── POST /v1/clients/{id}/unarchive ────────────────────────────────────────

    @Transactional
    public Result unarchive(UUID trainerId, UUID clientId, Map<String, Object> body) {
        keys(body, Set.of());
        var p = ClientScheduleService.params(trainerId, clientId);
        var client = schedules.lockClient(p);
        var effects = effects("sessionsBooked");
        if (!"archived".equals(client.get("status"))) return result(trainerId, clientId, effects);
        try {
            jdbc.update("""
                    UPDATE client SET status = 'active', archived_at = NULL, archive_reason = NULL, archive_note = NULL,
                           membership_status = 'not_invited', removed_at = NULL
                    WHERE id = :cid::uuid
                    """, p);
        } catch (DuplicateKeyException e) {
            throw new PhoneUnavailableException(ClientPhoneGuard.CODE_OWN_ROSTER,
                    "Someone on your roster has this number now. Change one of the two numbers first.");
        }
        client.put("status", "active");
        client.put("membership_status", "not_invited");
        effects.put("sessionsBooked", rebook(trainerId, clientId, p, "client_archived", client));
        log.info("client unarchived trainer={} client={} effects={}", trainerId, clientId, effects);
        return result(trainerId, clientId, effects);
    }

    // ── shared ─────────────────────────────────────────────────────────────────

    /** The verb's own future cancels come back, then the slots book onward from tomorrow. */
    private int rebook(UUID trainerId, UUID clientId, Map<String, Object> p, String reason, Map<String, Object> client) {
        int restored = restore(p, reason, "scheduled_at > now()");
        var zone = clock.zone();
        var made = schedules.book(trainerId, clientId, WorkspaceClock.today(zone).plusDays(1), zone);
        schedules.linkWorkouts(clientId, made, zone);
        return restored + made.size();
    }

    /**
     * Put back the future sessions this client's own verb cancelled, where the
     * start is still free — a time taken since stays cancelled rather than
     * double-booking the client.
     */
    private int restore(Map<String, Object> p, String reason, String where) {
        p.put("restoreReason", reason);
        return jdbc.update("""
                UPDATE scheduled_session s SET status = 'scheduled', cancel_reason = NULL
                WHERE s.client_id = :cid::uuid AND s.status = 'cancelled' AND s.cancel_reason = :restoreReason
                  AND s.deleted_at IS NULL AND (""" + where + """
                  ) AND NOT EXISTS (SELECT 1 FROM scheduled_session o
                                  WHERE o.client_id = s.client_id AND o.scheduled_at = s.scheduled_at
                                    AND o.id <> s.id AND o.deleted_at IS NULL AND o.status <> 'cancelled')
                """, p);
    }

    private Result result(UUID trainerId, UUID clientId, Map<String, Integer> effects) {
        return new Result(summaries.one(trainerId, clientId).orElseThrow(), effects);
    }

    private static Map<String, Integer> effects(String... names) {
        var out = new LinkedHashMap<String, Integer>();
        for (String n : names) out.put(n, 0);
        return out;
    }

    private static void keys(Map<String, Object> body, Set<String> allowed) {
        if (body == null) return;
        for (String key : body.keySet()) if (!allowed.contains(key)) throw ClientWriteService.unknown(key);
    }
}
