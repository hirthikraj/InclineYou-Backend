package com.inclineyou.inclineyou_backend.core.client;

import com.inclineyou.inclineyou_backend.core.client.dto.ArchiveRequest;
import com.inclineyou.inclineyou_backend.core.client.dto.PauseRequest;
import com.inclineyou.inclineyou_backend.core.client.dto.StateResult;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
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

    private final ClientJdbcRepository clients;
    private final ClientScheduleJdbcRepository sessions;
    private final WorkspaceClock clock;
    private final ClientSummaryService summaries;
    private final ClientScheduleService schedules;

    /** How a pack paused by a client pause is told apart from one paused on its own. */
    private static final String PAUSE_REASON = "Client paused";

    // ── POST /v1/clients/{id}/pause ────────────────────────────────────────────

    @Transactional
    public StateResult pause(UUID trainerId, UUID clientId, PauseRequest req) {
        LocalDate until = req.pausedUntil();
        var client = schedules.lockClient(trainerId, clientId);
        if (client.archived()) throw ClientScheduleService.archived();
        ZoneId zone = clock.zone();
        boolean already = client.paused();
        LocalDate start = already ? client.pausedAt().atZone(zone).toLocalDate() : WorkspaceClock.today(zone);
        if (until != null && until.isBefore(start)) {
            throw ApiException.validation("pausedUntil: before the pause starts");
        }
        var effects = effects("packagesPaused", "sessionsCancelled", "sessionsRestored");
        if (already && Objects.equals(client.pausedUntil(), until)) return result(trainerId, clientId, effects);

        if (already) {
            clients.setPausedUntil(clientId, until);
        } else {
            clients.pause(clientId, until);
            effects.put("packagesPaused", clients.pausePackages(clientId, PAUSE_REASON));
        }
        // Inside the pause: from now to the start of the return day (or forever).
        effects.put("sessionsCancelled", sessions.cancelUpcoming(clientId, "client_paused", until, zone));
        // A moved return day hands back what it no longer covers; an open-ended one covers everything.
        if (already && until != null) {
            effects.put("sessionsRestored", sessions.restoreUpcoming(clientId, "client_paused", until, zone));
        }
        log.info("client paused trainer={} client={} until={} effects={}", trainerId, clientId, until, effects);
        return result(trainerId, clientId, effects);
    }

    // ── POST /v1/clients/{id}/resume ───────────────────────────────────────────

    @Transactional
    public StateResult resume(UUID trainerId, UUID clientId) {
        var client = schedules.lockClient(trainerId, clientId);
        if (client.archived()) throw ClientScheduleService.archived();
        var effects = effects("packagesResumed", "sessionsBooked");
        if (!client.paused()) return result(trainerId, clientId, effects);

        clients.resume(clientId);
        effects.put("packagesResumed", clients.resumePackages(clientId, PAUSE_REASON));
        effects.put("sessionsBooked", rebook(trainerId, clientId, "client_paused"));
        log.info("client resumed trainer={} client={} effects={}", trainerId, clientId, effects);
        return result(trainerId, clientId, effects);
    }

    // ── POST /v1/clients/{id}/archive ──────────────────────────────────────────

    @Transactional
    public StateResult archive(UUID trainerId, UUID clientId, ArchiveRequest req) {
        var client = schedules.lockClient(trainerId, clientId);
        var effects = effects("sessionsCancelled", "packagesClosed", "packagesOwing");
        // The original reason and note are kept: changing them isn't a v1 action.
        if (client.archived()) return result(trainerId, clientId, effects);

        clients.archive(clientId, req.reason(), req.note());
        effects.put("sessionsCancelled", sessions.cancelUpcoming(clientId, "client_archived", null, clock.zone()));
        // A pack with nothing owed closes; one still owed stays open, so Business keeps chasing it.
        var close = new ArrayList<String>();
        int stillOwed = 0;
        for (var k : clients.activePackages(clientId)) {
            if (k.due().signum() > 0) stillOwed++;
            else close.add(k.id());
        }
        clients.closePackages(close);
        effects.put("packagesClosed", close.size());
        effects.put("packagesOwing", stillOwed);
        log.info("client archived trainer={} client={} reason={} effects={}", trainerId, clientId, req.reason(), effects);
        return result(trainerId, clientId, effects);
    }

    // ── POST /v1/clients/{id}/unarchive ────────────────────────────────────────

    @Transactional
    public StateResult unarchive(UUID trainerId, UUID clientId) {
        var client = schedules.lockClient(trainerId, clientId);
        var effects = effects("sessionsBooked");
        if (!client.archived()) return result(trainerId, clientId, effects);
        try {
            clients.unarchive(clientId);
        } catch (DuplicateKeyException e) {
            throw new PhoneUnavailableException(ClientPhoneGuard.CODE_OWN_ROSTER,
                    "Someone on your roster has this number now. Change one of the two numbers first.");
        }
        effects.put("sessionsBooked", rebook(trainerId, clientId, "client_archived"));
        log.info("client unarchived trainer={} client={} effects={}", trainerId, clientId, effects);
        return result(trainerId, clientId, effects);
    }

    // ── shared ─────────────────────────────────────────────────────────────────

    /** The verb's own future cancels come back, then the slots book onward from tomorrow. */
    private int rebook(UUID trainerId, UUID clientId, String reason) {
        var zone = clock.zone();
        int restored = sessions.restoreUpcoming(clientId, reason, null, zone);
        var made = schedules.book(trainerId, clientId, WorkspaceClock.today(zone).plusDays(1), zone);
        schedules.linkWorkouts(clientId, made, zone);
        return restored + made.size();
    }

    private StateResult result(UUID trainerId, UUID clientId, Map<String, Integer> effects) {
        return new StateResult(summaries.one(trainerId, clientId).orElseThrow(), effects);
    }

    private static Map<String, Integer> effects(String... names) {
        var out = new LinkedHashMap<String, Integer>();
        for (String n : names) out.put(n, 0);
        return out;
    }
}
