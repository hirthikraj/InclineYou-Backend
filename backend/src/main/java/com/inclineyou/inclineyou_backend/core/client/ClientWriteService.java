package com.inclineyou.inclineyou_backend.core.client;

import com.inclineyou.inclineyou_backend.core.client.dto.ClientCreated;
import com.inclineyou.inclineyou_backend.core.client.dto.ClientSummary;
import com.inclineyou.inclineyou_backend.core.client.dto.CreateClientRequest;
import com.inclineyou.inclineyou_backend.core.client.dto.PhoneCheckRequest;
import com.inclineyou.inclineyou_backend.core.client.dto.UpdateClientRequest;
import com.inclineyou.inclineyou_backend.core.join.JoinJdbcRepository;
import com.inclineyou.inclineyou_backend.core.tenant.CurrentScope;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.UUID;

/**
 * api-contract 1.1 Clients A4–A6: the phone check, {@code POST /v1/clients} and
 * {@code PATCH /v1/clients/{id}}. Every answer is the L3 summary row, so the add
 * flow and the roster read one shape.
 *
 * <p>The request records arrive already shape-checked ({@code @Valid}); what is
 * left here is what needs the database or the workspace — the roster rules on
 * the number, the 18+ rule in the workspace's calendar, id replays and If-Match.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ClientWriteService {

    private final ClientJdbcRepository clients;
    private final ClientInviteJdbcRepository invites;
    private final ClientScheduleJdbcRepository schedules;
    private final ClientPhoneGuard phoneGuard;
    private final ClientSummaryService summaries;
    private final WorkspaceClock clock;
    private final ConsentGate consent;
    private final LeadRules leads;
    private final JoinJdbcRepository joins;

    public ClientPhoneGuard.Verdict phoneCheck(UUID trainerId, PhoneCheckRequest req) {
        var verdict = phoneGuard.check(trainerId.toString(), req.phone(), true);
        if (!verdict.available() || req.phone() == null || req.phone().isBlank()) return verdict;
        var scope = CurrentScope.get();
        if (scope == null) return verdict;
        return joins.waitingFor(trainerId, scope.activeTenantId(), req.phone())
                .map(w -> verdict.withJoinRequest(w.id().toString(), w.name()))
                .orElse(verdict);
    }

    @Transactional
    public ClientCreated create(UUID trainerId, CreateClientRequest req) {
        requireAdult(req.dateOfBirth());
        leads.requirePack(trainerId, req.interestedPackId());
        leads.requireFollowUp("nextFollowUpOn", req.nextFollowUpOn());
        UUID id = req.id() == null ? UUID.randomUUID() : req.id();
        if (req.id() != null) {
            var replay = replay(trainerId, id);
            if (replay != null) return new ClientCreated(replay, false);
        }
        requirePhone(trainerId, req.phone());
        if (!clients.insert(id, trainerId, req)) {
            // Something was in the way that the checks above did not see — a request racing this one (18 Nov 2026).
            // The same id is a double tap whose first request has just committed: answer it as a replay (200). The
            // same number is another add that won the race: the guard's own refusal. The transaction is still usable,
            // because nothing threw.
            if (req.id() != null) {
                var replay = replay(trainerId, id);
                if (replay != null) return new ClientCreated(replay, false);
            }
            var verdict = phoneGuard.check(trainerId.toString(), req.phone());
            if (!verdict.available()) throw new PhoneUnavailableException(verdict.code(), verdict.message());
            throw ApiException.idConflict();
        }
        if (req.schedule() != null) schedules.setDefaults(id, req.schedule());
        // A join request from this number can no longer be approved (it would answer already_client): close it.
        var scope = CurrentScope.get();
        if (scope != null && req.phone() != null && !req.phone().isBlank()) {
            int closed = joins.closeForAdded(trainerId, scope.activeTenantId(), req.phone());
            if (closed > 0) log.info("join request closed by a hand add trainer={} client={}", trainerId, id);
        }
        log.info("client created trainer={} client={} type={}", trainerId, id, req.clientType());
        return new ClientCreated(summaries.one(trainerId, id).orElseThrow(), true);
    }

    @Transactional
    public ClientSummary patch(UUID trainerId, UUID clientId, UpdateClientRequest req, String ifMatch) {
        if (req.isEmpty()) throw ApiException.validation("body: send at least one field");
        var row = clients.lockForPatch(trainerId, clientId)
                .orElseThrow(() -> ApiException.notFound("That client is not on your roster."));
        if (stale(ifMatch, row.version())) {
            throw new ApiException(HttpStatus.PRECONDITION_FAILED, "PRECONDITION_FAILED",
                    "This client changed since you opened it.");
        }
        if (req.dateOfBirth() != null) requireAdult(req.dateOfBirth().value());
        if (req.interestedPackId() != null) leads.requirePack(trainerId, req.interestedPackId().value());
        if (req.nextFollowUpOn() != null) leads.requireFollowUp("nextFollowUpOn", req.nextFollowUpOn().value());
        // The personal profile — goal, height, activity — waits for consent (22 Nov 2026). Name, number, date of birth
        // and type are the business record a client is added with, and stay editable.
        // Clearing one is taking data away and stays open.
        if (((req.goal() != null && req.goal().value() != null) || (req.heightCm() != null && req.heightCm().value() != null)
                || (req.activityLevel() != null && req.activityLevel().value() != null))
                && !consent.consented(clientId)) {
            throw ConsentGate.refusal("their goal, height or activity level");
        }
        String phone = req.phone() == null ? null : req.phone().value();
        boolean numberMoves = req.phone() != null && !java.util.Objects.equals(phone, row.phone());
        // On the portal the number IS their sign-in (an OTP to it), so it is theirs to keep: changing it here would hand
        // their account to whoever holds the new number. Re-saving the same number is still fine.
        if (numberMoves && ("accepted".equals(row.membershipStatus()) || "paused".equals(row.membershipStatus()))) {
            throw ApiException.conflict("CLIENT_ALREADY_ACCEPTED",
                    "They are on the portal, and this number is how they sign in. It can't be changed here.");
        }
        // A client's type is who owns their money: the trainer, or the gym that collects it. Switched while a pack is
        // running or owed, the trainer's own packs and single sales stayed on a gym client (or the reverse) and money
        // recorded on them afterwards was stamped with the new collector (18 Nov 2026). check_package_client_type runs
        // only when a package is written, so it is checked here.
        if (req.clientType() != null && !java.util.Objects.equals(req.clientType().value(), row.clientType())
                && clients.hasLiveMoney(clientId)) {
            throw ApiException.conflict("CLIENT_HAS_PACKAGES", "This client has a pack that is running or still owed. "
                    + "Finish or close it before switching between your own client and a gym client.");
        }
        // Only when it moves: re-saving a number never starts failing.
        if (numberMoves && phone != null) requirePhone(trainerId, phone);
        if (!clients.updateUnlessNumberTaken(clientId, req)) {
            // Another write took the number between the check and the UPDATE. The savepoint kept the transaction
            // usable, so the guard can say who has it now.
            var verdict = phoneGuard.check(trainerId.toString(), phone);
            throw verdict.available()
                    ? new PhoneUnavailableException(ClientPhoneGuard.CODE_OTHER_ROSTER, "This number was just added to a roster.")
                    : new PhoneUnavailableException(verdict.code(), verdict.message());
        }
        // The invitation was to the old number, and its link would still open for whoever holds it. Withdrawn and the
        // client put back at the start; the trainer invites the new number when they are ready.
        if (numberMoves) {
            invites.revokePending(clientId, "number_changed");
            invites.startOver(clientId);
        }
        return summaries.one(trainerId, clientId).orElseThrow();
    }

    /**
     * An If-Match that was sent, isn't {@code *}, and names another version.
     * An absent one passes: on a PATCH it is honoured when sent, not required.
     */
    static boolean stale(String ifMatch, String version) {
        return com.inclineyou.inclineyou_backend.shared.wire.IfMatch.stale(ifMatch, version);
    }

    /** A replay of this trainer's own id answers the row; the id anywhere else is a clash. */
    private ClientSummary replay(UUID trainerId, UUID id) {
        var owner = clients.ownerOf(id);
        if (owner.isEmpty()) return null;
        if (!trainerId.equals(owner.get())) throw ApiException.idConflict();
        return summaries.one(trainerId, id).orElseThrow(ApiException::idConflict);
    }

    private void requirePhone(UUID trainerId, String phone) {
        var verdict = phoneGuard.check(trainerId.toString(), phone);
        if (verdict.available()) return;
        if (ClientPhoneGuard.CODE_INVALID.equals(verdict.code())) throw ApiException.validation("phone: " + verdict.message());
        throw new PhoneUnavailableException(verdict.code(), verdict.message());
    }


    /** 18+ in the workspace's calendar (R20, MUST-22) — 422, since it can never succeed as written. */

    private void requireAdult(LocalDate dob) {
        if (dob == null) return;
        if (dob.isBefore(LocalDate.of(1900, 1, 1))) throw ApiException.validation("dateOfBirth: before 1900");
        if (dob.isAfter(WorkspaceClock.today(clock.zone()).minusYears(18))) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "CLIENT_UNDER_18",
                    "Clients must be 18 or older.");
        }
    }
}
