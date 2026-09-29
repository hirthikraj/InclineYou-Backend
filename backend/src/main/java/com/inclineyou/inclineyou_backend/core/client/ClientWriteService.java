package com.inclineyou.inclineyou_backend.core.client;

import com.inclineyou.inclineyou_backend.core.client.dto.ClientSummary;
import com.inclineyou.inclineyou_backend.core.client.dto.CreateClientRequest;
import com.inclineyou.inclineyou_backend.core.client.dto.PhoneCheckRequest;
import com.inclineyou.inclineyou_backend.core.client.dto.UpdateClientRequest;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
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
    private final ClientScheduleJdbcRepository schedules;
    private final ClientPhoneGuard phoneGuard;
    private final ClientSummaryService summaries;
    private final WorkspaceClock clock;

    /** The row and whether this call made it (201) or a replay found it (200). */
    public record Created(ClientSummary client, boolean created) {}

    public ClientPhoneGuard.Verdict phoneCheck(UUID trainerId, PhoneCheckRequest req) {
        return phoneGuard.check(trainerId.toString(), req.phone(), true);
    }

    @Transactional
    public Created create(UUID trainerId, CreateClientRequest req) {
        requireAdult(req.dateOfBirth());
        UUID id = req.id() == null ? UUID.randomUUID() : req.id();
        if (req.id() != null) {
            var replay = replay(trainerId, id);
            if (replay != null) return new Created(replay, false);
        }
        requirePhone(trainerId, req.phone());
        try {
            clients.insert(id, trainerId, req);
        } catch (DuplicateKeyException e) {
            throw duplicate(trainerId, req.phone(), e);
        }
        if (req.schedule() != null) schedules.setDefaults(id, req.schedule());
        log.info("client created trainer={} client={} type={}", trainerId, id, req.clientType());
        return new Created(summaries.one(trainerId, id).orElseThrow(), true);
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
        String phone = req.phone() == null ? null : req.phone().value();
        // Only when it moves: re-saving an accepted number never starts failing.
        if (phone != null && !phone.equals(row.phone())) requirePhone(trainerId, phone);
        try {
            clients.update(clientId, req);
        } catch (DuplicateKeyException e) {
            throw duplicate(trainerId, phone, e);
        }
        return summaries.one(trainerId, clientId).orElseThrow();
    }

    /**
     * An If-Match that was sent, isn't {@code *}, and names another version.
     * An absent one passes: on a PATCH it is honoured when sent, not required.
     */
    static boolean stale(String ifMatch, String version) {
        if (ifMatch == null || ifMatch.isBlank() || "*".equals(ifMatch.strip())) return false;
        return !ifMatch.strip().replaceFirst("^W/", "").replace("\"", "").equals(version);
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

    /** A check isn't a lock: two adds racing for one number meet uq_client_phone_live here. */
    private RuntimeException duplicate(UUID trainerId, String phone, DuplicateKeyException e) {
        String msg = String.valueOf(e.getMostSpecificCause().getMessage());
        if (!msg.contains("uq_client_phone_live")) return ApiException.idConflict();
        var verdict = phoneGuard.check(trainerId.toString(), phone);
        return verdict.available()
                ? new PhoneUnavailableException(ClientPhoneGuard.CODE_OTHER_ROSTER, "This number was just added to a roster.")
                : new PhoneUnavailableException(verdict.code(), verdict.message());
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
