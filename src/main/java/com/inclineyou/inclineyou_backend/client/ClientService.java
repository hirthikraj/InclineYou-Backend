package com.inclineyou.inclineyou_backend.client;

import com.inclineyou.inclineyou_backend.entity.BodyMetric;
import com.inclineyou.inclineyou_backend.entity.Client;
import com.inclineyou.inclineyou_backend.entity.ClientNote;
import com.inclineyou.inclineyou_backend.repository.BodyMetricRepository;
import com.inclineyou.inclineyou_backend.repository.ClientNoteRepository;
import com.inclineyou.inclineyou_backend.repository.ClientRepository;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;


import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
@RequiredArgsConstructor
public class ClientService {

    private final ClientRepository clientRepo;
    private final BodyMetricRepository bodyMetricRepo;
    private final ClientNoteRepository clientNoteRepo;
    private final ClientPhoneGuard phoneGuard;
    private final NamedParameterJdbcTemplate jdbc;

    // ── DTOs ──────────────────────────────────────────────────────────────────

    public record CreateClientRequest(
            @NotBlank String name,
            String phone,
            String goal,
            String paymentMode,
            BigDecimal trainerSplitPercent,
            BigDecimal heightCm,
            String activityLevel,
            Map<String, Object> metadata,
            Integer sessionsPerWeek,
            Integer sessionDurationMinutes,
            String deliveryMode
    ) {}

    public record UpdateClientRequest(
            String name,
            String phone,
            String goal,
            String status,
            String paymentMode,
            BigDecimal trainerSplitPercent,
            BigDecimal heightCm,
            String activityLevel,
            Map<String, Object> metadata,
            Integer sessionsPerWeek,
            Integer sessionDurationMinutes,
            List<Map<String, Object>> weeklySchedule,
            String deliveryMode
    ) {}

    /** One number to ask about, in a body rather than a query string. */
    public record PhoneCheckRequest(@NotBlank String phone) {}

    public record StatusFlags(boolean paymentDue, boolean sessionPackLow, boolean planExpiring) {}

    public record ClientResponse(
            UUID id,
            UUID trainerId,
            String name,
            String phone,
            String goal,
            String status,
            String paymentMode,
            BigDecimal trainerSplitPercent,
            BigDecimal heightCm,
            String activityLevel,
            Map<String, Object> metadata,
            Integer sessionsPerWeek,
            Integer sessionDurationMinutes,
            List<Map<String, Object>> weeklySchedule,
            String deliveryMode,
            StatusFlags statusFlags,
            long createdAt,
            long updatedAt,
            /*
             * V18's `membership_status` — 'accepted' | 'invited' | 'declined' |
             * 'removed' | 'unavailable'. It is the state of the *invitation*, not
             * of the coaching: `status` above says whether this person is an
             * active client, this says whether their phone can be reached at all.
             *
             * The column has existed since V18 and travels in the sync envelope;
             * this DTO never carried it, which cost the roster one whole attention
             * band. 'unavailable' fires when the number a trainer typed already
             * signs in as a trainer account — the invite can never be delivered,
             * so the row needs a *Fix number* action rather than a silent wait.
             * The phone reads the field out of SQLite and draws the band; the web
             * had no way to know, so the band simply did not exist there.
             *
             * APPENDED LAST — every existing caller destructures by name, so a
             * reader written against the eighteen-field shape keeps working.
             */
            String membershipStatus
    ) {}

    public record BodyMetricRequest(
            @NotBlank String metricType,
            @NotNull BigDecimal value,
            @NotBlank String unit,
            String notes,
            @NotNull Long recordedAt
    ) {}

    public record BodyMetricResponse(
            UUID id,
            UUID clientId,
            String metricType,
            BigDecimal value,
            String unit,
            String notes,
            long recordedAt,
            long createdAt
    ) {}

    /* ── V29 · the trainer's own notes ─────────────────────────────────────
       Free text and a pin. There is no injury field, no condition field and no
       PAR-Q flag in this request, and there must never be one — the interaction
       map excludes health data outright under the DPDP Act 2023, and a field
       that tells a medical note apart from any other note makes this a health
       record whatever it is called. `V29__client_note.sql` carries the whole
       argument, including the sanctioned path to structured health data, which
       is a separate consented table and not a wider version of this one. */

    public record NoteRequest(
            @NotBlank String body,
            Boolean pinned
    ) {}

    public record NoteResponse(
            UUID id,
            UUID clientId,
            String body,
            boolean pinned,
            long createdAt,
            long updatedAt
    ) {}

    // ── Client CRUD ───────────────────────────────────────────────────────────

    public List<ClientResponse> list(UUID trainerId) {
        var clients = clientRepo.findByTrainerIdAndDeletedAtIsNullOrderByCreatedAtDesc(trainerId);
        if (clients.isEmpty()) return List.of();

        var idStrings = clients.stream().map(c -> c.getId().toString()).toList();
        var flagMap = computeStatusFlags(trainerId, idStrings);

        return clients.stream()
                .map(c -> toResponse(c, flagMap.getOrDefault(c.getId(), new StatusFlags(false, false, false))))
                .toList();
    }

    public ClientResponse get(UUID trainerId, UUID clientId) {
        var client = findOwned(trainerId, clientId);
        var flags = computeStatusFlags(trainerId, List.of(clientId.toString()))
                .getOrDefault(clientId, new StatusFlags(false, false, false));
        return toResponse(client, flags);
    }

    /** Can this trainer put this number on their roster? Asked before the form is submitted. */
    public ClientPhoneGuard.Verdict checkPhone(UUID trainerId, String phone) {
        return phoneGuard.check(trainerId.toString(), phone);
    }

    @Transactional
    public ClientResponse create(UUID trainerId, CreateClientRequest req) {
        phoneGuard.require(trainerId.toString(), req.phone());

        var client = new Client();
        client.setTrainerId(trainerId);
        client.setName(req.name());
        client.setPhone(req.phone());
        client.setGoal(req.goal());
        client.setPaymentMode(req.paymentMode() != null ? req.paymentMode() : "trainer_collects");
        client.setTrainerSplitPercent(req.trainerSplitPercent());
        client.setHeightCm(req.heightCm());
        client.setActivityLevel(req.activityLevel());
        client.setMetadata(req.metadata());
        client.setSessionsPerWeek(req.sessionsPerWeek());
        client.setSessionDurationMinutes(req.sessionDurationMinutes());
        client.setDeliveryMode(deliveryMode(req.deliveryMode()));
        clientRepo.save(client);
        return toResponse(client, new StatusFlags(false, false, false));
    }

    @Transactional
    public ClientResponse update(UUID trainerId, UUID clientId, UpdateClientRequest req) {
        var client = findOwned(trainerId, clientId);
        if (req.name() != null)                client.setName(req.name());
        // Only when it actually moves: re-saving a row whose number was already
        // accepted must not start failing because the rule arrived after it.
        if (req.phone() != null && !req.phone().equals(client.getPhone())) {
            phoneGuard.require(trainerId.toString(), req.phone());
        }
        if (req.phone() != null)               client.setPhone(req.phone());
        if (req.goal() != null)                client.setGoal(req.goal());
        if (req.status() != null)              client.setStatus(req.status());
        if (req.paymentMode() != null)         client.setPaymentMode(req.paymentMode());
        if (req.trainerSplitPercent() != null) client.setTrainerSplitPercent(req.trainerSplitPercent());
        if (req.heightCm() != null)            client.setHeightCm(req.heightCm());
        if (req.activityLevel() != null)            client.setActivityLevel(req.activityLevel());
        if (req.metadata() != null)                 client.setMetadata(req.metadata());
        if (req.sessionsPerWeek() != null)          client.setSessionsPerWeek(req.sessionsPerWeek());
        if (req.sessionDurationMinutes() != null)   client.setSessionDurationMinutes(req.sessionDurationMinutes());
        if (req.weeklySchedule() != null)           client.setWeeklySchedule(req.weeklySchedule());
        // An empty string clears it back to "never said" — the same convention
        // the trainer profile endpoint uses for its skippable fields.
        if (req.deliveryMode() != null)             client.setDeliveryMode(deliveryMode(req.deliveryMode()));
        clientRepo.save(client);
        var flags = computeStatusFlags(trainerId, List.of(clientId.toString()))
                .getOrDefault(clientId, new StatusFlags(false, false, false));
        return toResponse(client, flags);
    }

    @Transactional
    public void delete(UUID trainerId, UUID clientId) {
        var client = findOwned(trainerId, clientId);
        client.setDeletedAt(Instant.now());
        clientRepo.save(client);
    }

    // ── Body metrics ──────────────────────────────────────────────────────────

    public List<BodyMetricResponse> listMetrics(UUID trainerId, UUID clientId) {
        findOwned(trainerId, clientId);
        return bodyMetricRepo.findByClientIdAndDeletedAtIsNullOrderByRecordedAtDesc(clientId)
                .stream().map(this::toMetricResponse).toList();
    }

    @Transactional
    public BodyMetricResponse addMetric(UUID trainerId, UUID clientId, BodyMetricRequest req) {
        findOwned(trainerId, clientId);
        var m = new BodyMetric();
        m.setClientId(clientId);
        m.setMetricType(req.metricType());
        m.setValue(req.value());
        m.setUnit(req.unit());
        m.setNotes(req.notes());
        m.setRecordedAt(Instant.ofEpochMilli(req.recordedAt()));
        bodyMetricRepo.save(m);
        return toMetricResponse(m);
    }

    // ── Notes (V29) ───────────────────────────────────────────────────────────

    /**
     * A trainer's note is capped at 4,000 characters.
     *
     * The column is TEXT and takes anything; this is about a note staying a note.
     * The cap is checked before the write so the answer is a 400 with a reason
     * rather than a silent truncation of something somebody just typed.
     */
    private static final int NOTE_MAX = 4_000;

    /**
     * This trainer's own notes on this client, newest first.
     *
     * Two checks, and the second is not redundant: {@code findOwned} says the
     * CLIENT is this trainer's, and the repository predicate says the NOTES are.
     * A team lets a coach hold a teammate's client, so ownership of the client is
     * not ownership of the notes on it.
     */
    public List<NoteResponse> listNotes(UUID trainerId, UUID clientId) {
        findOwned(trainerId, clientId);
        return clientNoteRepo
                .findByClientIdAndTrainerIdAndDeletedAtIsNullOrderByCreatedAtDesc(clientId, trainerId)
                .stream().map(this::toNoteResponse).toList();
    }

    @Transactional
    public NoteResponse addNote(UUID trainerId, UUID clientId, NoteRequest req) {
        findOwned(trainerId, clientId);
        var note = new ClientNote();
        note.setClientId(clientId);
        note.setTrainerId(trainerId);
        note.setBody(noteBody(req.body()));
        note.setPinned(Boolean.TRUE.equals(req.pinned()));
        clientNoteRepo.save(note);
        return toNoteResponse(note);
    }

    /**
     * Edit the text, the pin, or both.
     *
     * `pinned` is nullable in the request and absent means UNCHANGED, which is
     * what lets the strip's pin toggle and the notes tab's editor be the same
     * route without either one clobbering the other's field.
     */
    @Transactional
    public NoteResponse updateNote(UUID trainerId, UUID clientId, UUID noteId, NoteRequest req) {
        findOwned(trainerId, clientId);
        var note = findOwnedNote(trainerId, clientId, noteId);
        if (req.body() != null) note.setBody(noteBody(req.body()));
        if (req.pinned() != null) note.setPinned(req.pinned());
        clientNoteRepo.save(note);
        return toNoteResponse(note);
    }

    @Transactional
    public void deleteNote(UUID trainerId, UUID clientId, UUID noteId) {
        findOwned(trainerId, clientId);
        var note = findOwnedNote(trainerId, clientId, noteId);
        note.setDeletedAt(Instant.now());
        clientNoteRepo.save(note);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * 'floor' | 'remote' | null.
     *
     * Anything else is stored as null rather than rejected with a 400: an older
     * or newer client sending a mode this build doesn't know about should lose
     * one optional field, not have its whole write fail. Tolerant reader, both
     * directions — the same contract the rest of the sync surface keeps.
     */
    private static String deliveryMode(String raw) {
        if (raw == null) return null;
        String value = raw.trim().toLowerCase();
        return value.equals("floor") || value.equals("remote") ? value : null;
    }

    private Client findOwned(UUID trainerId, UUID clientId) {
        return clientRepo.findByIdAndTrainerIdAndDeletedAtIsNull(clientId, trainerId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Client not found"));
    }

    /**
     * A 404 rather than a 403 for somebody else's note, and that is the point:
     * a trainer asking about a note they did not write should not learn that it
     * exists. Same shape as {@code findOwned} above, for the same reason.
     */
    private ClientNote findOwnedNote(UUID trainerId, UUID clientId, UUID noteId) {
        return clientNoteRepo
                .findByIdAndClientIdAndTrainerIdAndDeletedAtIsNull(noteId, clientId, trainerId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Note not found"));
    }

    private static String noteBody(String raw) {
        var body = raw == null ? "" : raw.strip();
        if (body.isEmpty()) {
            throw new ResponseStatusException(BAD_REQUEST, "A note needs some text");
        }
        if (body.length() > NOTE_MAX) {
            throw new ResponseStatusException(
                    BAD_REQUEST, "A note is capped at " + NOTE_MAX + " characters");
        }
        return body;
    }

    private NoteResponse toNoteResponse(ClientNote n) {
        return new NoteResponse(
                n.getId(), n.getClientId(), n.getBody(), n.isPinned(),
                n.getCreatedAt().toEpochMilli(), n.getUpdatedAt().toEpochMilli()
        );
    }

    private ClientResponse toResponse(Client c, StatusFlags flags) {
        return new ClientResponse(
                c.getId(), c.getTrainerId(), c.getName(), c.getPhone(), c.getGoal(),
                c.getStatus(), c.getPaymentMode(), c.getTrainerSplitPercent(), c.getHeightCm(),
                c.getActivityLevel(), c.getMetadata(),
                c.getSessionsPerWeek(), c.getSessionDurationMinutes(), c.getWeeklySchedule(),
                c.getDeliveryMode(),
                flags,
                c.getCreatedAt().toEpochMilli(), c.getUpdatedAt().toEpochMilli(),
                c.getMembershipStatus()
        );
    }

    private BodyMetricResponse toMetricResponse(BodyMetric m) {
        return new BodyMetricResponse(
                m.getId(), m.getClientId(), m.getMetricType(), m.getValue(),
                m.getUnit(), m.getNotes(),
                m.getRecordedAt().toEpochMilli(), m.getCreatedAt().toEpochMilli()
        );
    }

    // Compute status flags for a batch of client IDs in 3 targeted queries.
    private Map<UUID, StatusFlags> computeStatusFlags(UUID trainerId, List<String> clientIds) {
        if (clientIds.isEmpty()) return Map.of();

        var params = Map.of("tid", trainerId.toString(), "ids", clientIds);

        Set<UUID> paymentDue = fetchClientIdSet("""
                SELECT DISTINCT client_id::text AS client_id FROM payment
                WHERE trainer_id = :tid::uuid
                  AND client_id::text IN (:ids)
                  AND status = 'pending'
                  AND deleted_at IS NULL
                """, params);

        Set<UUID> sessionLow = fetchClientIdSet("""
                SELECT DISTINCT client_id::text AS client_id FROM package
                WHERE trainer_id = :tid::uuid
                  AND client_id::text IN (:ids)
                  AND status = 'active'
                  AND sessions_remaining IS NOT NULL
                  AND sessions_remaining <= 2
                  AND deleted_at IS NULL
                """, params);

        Set<UUID> planExpiring = fetchClientIdSet("""
                SELECT DISTINCT client_id::text AS client_id FROM program
                WHERE trainer_id = :tid::uuid
                  AND client_id::text IN (:ids)
                  AND status = 'active'
                  AND end_date IS NOT NULL
                  AND end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
                  AND deleted_at IS NULL
                """, params);

        return clientIds.stream()
                .map(UUID::fromString)
                .filter(id -> paymentDue.contains(id) || sessionLow.contains(id) || planExpiring.contains(id))
                .collect(Collectors.toMap(
                        id -> id,
                        id -> new StatusFlags(paymentDue.contains(id), sessionLow.contains(id), planExpiring.contains(id))
                ));
    }

    private Set<UUID> fetchClientIdSet(String sql, Map<String, ?> params) {
        return jdbc.queryForList(sql, params).stream()
                .map(r -> UUID.fromString(r.get("client_id").toString()))
                .collect(Collectors.toSet());
    }
}
