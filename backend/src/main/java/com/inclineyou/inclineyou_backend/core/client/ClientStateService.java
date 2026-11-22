package com.inclineyou.inclineyou_backend.core.client;

import com.inclineyou.inclineyou_backend.core.assessment.AssessmentJdbcRepository;
import com.inclineyou.inclineyou_backend.core.assessment.AssessmentScheduleJdbcRepository;
import com.inclineyou.inclineyou_backend.core.client.dto.ArchiveRequest;
import com.inclineyou.inclineyou_backend.core.client.dto.DeleteClientRequest;
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
 * Pause, resume, archive, unarchive and delete — api-contract 1.1 Clients A1–A3,
 * the unarchive verb, and the fifth, irreversible one. The first four answer
 * {@code {client, effects}} (R72), and asking for the state a client is already
 * in is a 200 with zero effects, never an error.
 *
 * <p>What the verbs cancel they mark ({@code cancel_reason}, V2), so undoing one
 * brings back exactly those sessions and never one somebody called off by hand
 * (R70). Resume and unarchive restore the future sessions their own pause or
 * archive cancelled, then book the week onward (R21).
 *
 * <p>Delete has no undo, which is the one way it is not shaped like the other
 * four: {@link #delete} answers with the summary it read BEFORE the row was
 * tombstoned, because {@code summaries.one} would find nothing afterward — the
 * same {@code deleted_at IS NULL} filter every trainer-facing read uses.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ClientStateService {

    private final ClientJdbcRepository clients;
    private final ClientInviteJdbcRepository invites;
    private final ClientScheduleJdbcRepository sessions;
    private final ClientNoteJdbcRepository clientNotes;
    private final AssessmentScheduleJdbcRepository assessmentSchedules;
    private final AssessmentJdbcRepository assessments;
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
        // Archive is how a trainer ends a client's access (R98), so a link they were sent stops opening with it.
        invites.revokePending(clientId, "trainer");
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

    // ── POST /v1/clients/{id}/delete ───────────────────────────────────────────

    /**
     * Erase an ARCHIVED client — the second of two steps (decided 9 Nov 2026). Archive is the reversible one: sessions
     * cancelled, packs with nothing owed closed, access ended, all of it undone by Unarchive. Delete is the erase, and
     * nothing can undo it, support included, so it is refused ({@code CLIENT_NOT_ARCHIVED}) for a client who is not
     * archived, and still needs their name typed.
     *
     * <p>What goes and what stays is {@code erase_clients()}'s (V1, V11), run through {@code erase_client()}, the one door
     * a trainer's connection may call: everything personal is hard-deleted (programs and workouts, assessments, notes,
     * messages, feedback, milestones, schedule, invites, reminders, the nudge log, attention dismissals) and the free
     * text on what stays is wiped. What stays is the money book — packages, payments and delivered sessions, as amounts
     * and dates — because tax law requires it (GST records, 72 months; DPDP s. 8(7) defers to it), and the client row,
     * nameless, so those rows still resolve. Until 9 Nov 2026 this route was a soft delete that kept the name and most
     * of the client's data; the erase function existed and nothing called it.
     */
    @Transactional
    public StateResult delete(UUID trainerId, UUID clientId, DeleteClientRequest req) {
        // A repeat of a delete that went through (its answer lost to a dropped connection) answers as every other
        // client verb answers a repeat: 200 and no effects (18 Nov 2026). It used to be a 404 "not on your roster", and
        // the screen said the delete had failed about a client who was gone. There is no client left to describe, so
        // `client` is null. Another trainer's id, or one that never existed, is still a 404.
        if (clients.erasedClientOf(trainerId, clientId)) {
            return new StateResult(null, effects("sessionsCancelled", "packagesClosed", "packagesOwing", "notesDeleted"));
        }
        var locked = schedules.lockClient(trainerId, clientId);
        if (!locked.archived()) throw ClientRuleException.notArchived();
        var summary = summaries.one(trainerId, clientId)
                .orElseThrow(() -> ApiException.notFound("That client is not on your roster."));
        String typed = req.confirmName() == null ? "" : req.confirmName().trim();
        if (!typed.equalsIgnoreCase(summary.name() == null ? "" : summary.name().trim())) {
            throw ClientRuleException.deleteNotConfirmed();
        }

        // Archive did these already; they are run again so the four effect keys stay honest if anything was booked
        // or sold in between (both are refused for an archived client, so they normally answer 0).
        var effects = effects("sessionsCancelled", "packagesClosed", "packagesOwing", "notesDeleted");
        effects.put("sessionsCancelled", sessions.cancelUpcoming(clientId, "client_deleted", null, clock.zone()));
        // Same rule as archive: a pack with nothing owed closes, one still owed stays open for Business.
        var close = new ArrayList<String>();
        int stillOwed = 0;
        for (var k : clients.activePackages(clientId)) {
            if (k.due().signum() > 0) stillOwed++;
            else close.add(k.id());
        }
        clients.closePackages(close);
        effects.put("packagesClosed", close.size());
        effects.put("packagesOwing", stillOwed);
        effects.put("notesDeleted", clientNotes.softDeleteAllForClient(clientId));
        // A deleted client's assessments go with them, done ones too, and their cycles first (the cycle is always locked
        // before its assessment). Logged rather than added to effects: that map is the contract's four keys.
        int cyclesDeleted = assessmentSchedules.softDeleteAllForClient(clientId);
        int assessmentsDeleted = assessments.softDeleteAllForClient(clientId);

        clients.delete(clientId);
        // Same reason as archive, and stronger: nobody should be able to open a link to a client who no longer exists.
        invites.revokePending(clientId, "trainer");
        // The erase, in the same transaction: a refusal anywhere above leaves the client exactly as they were.
        clients.erase(clientId);
        log.info("client deleted and erased trainer={} client={} effects={} assessmentsDeleted={} cyclesDeleted={}",
                trainerId, clientId, effects, assessmentsDeleted, cyclesDeleted);
        return new StateResult(summary, effects);
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
