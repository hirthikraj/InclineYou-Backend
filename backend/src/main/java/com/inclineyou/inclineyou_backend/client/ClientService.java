package com.inclineyou.inclineyou_backend.client;

import com.inclineyou.inclineyou_backend.assessment.MeasurementService;
import com.inclineyou.inclineyou_backend.assessment.MetricReadings;
import com.inclineyou.inclineyou_backend.session.DiaryService;
import com.inclineyou.inclineyou_backend.session.SessionPlanner;
import com.inclineyou.inclineyou_backend.entity.Client;
import com.inclineyou.inclineyou_backend.entity.ClientNote;
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
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;
import java.util.stream.Collectors;


import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
@RequiredArgsConstructor
public class ClientService {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    private final ClientRepository clientRepo;
    private final MetricReadings metricReadings;
    private final ClientNoteRepository clientNoteRepo;
    private final ClientPhoneGuard phoneGuard;
    private final NamedParameterJdbcTemplate jdbc;
    /** V3 · the diary follows the rhythm. See {@link #update}. */
    private final DiaryService diary;

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
            String deliveryMode,
            /* ---- V5 · the measuring cycle. Null leaves alone; 0 / "" / [] clears. ---- */
            Integer assessmentIntervalDays,
            /** ISO date. "" clears it — nothing is owed. */
            String nextAssessmentOn,
            List<String> assessmentMetrics,
            /* ---- V7. Null leaves alone; "" clears. ISO date, not in the future. ---- */
            String dateOfBirth
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
            String membershipStatus,
            /*
             * ── APPENDED BY V3 · THE RHYTHM BOOKS THE SESSIONS ───────────────
             *
             * How many sessions THIS REQUEST put in the diary, and when the
             * first one lands. Exactly the pair {@code PackageResponse} carries
             * for the same reason and under the same rules: not a `client`
             * column and not pretending to be one — what the write DID, which
             * is what lets the add-a-client flow say "12 booked, first on
             * Monday" instead of moving on in silence.
             *
             * Counting the diary afterwards would answer a different question:
             * a client who already had four sessions on the board comes back as
             * sixteen. So it is {@link DiaryService.Result}'s own figure, and it
             * is NULL on every read and on every write that did not touch the
             * rhythm — a name change books nothing and must not claim a zero.
             * Zero is a real answer: a week agreed for somebody with no live
             * pack and no working days books nothing, and the screen says so
             * rather than implying a diary that is not there.
             */
            Integer sessionsBooked,
            /** Epoch millis of the first session this request booked. Null with
             *  {@code sessionsBooked}, and null when it booked nothing. */
            Long firstSessionAt,
            /*
             * ── APPENDED BY V5 · THE MEASURING CYCLE ─────────────────────────
             *
             * On the client row rather than derived from the last assessment, because
             * `/today` reads this endpoint trainer-wide and a due-check computed
             * from last-reading-per-client is one request per client on the one
             * screen a trainer opens every morning.
             *
             * `nextAssessmentOn` is an ISO date and not an instant: what is owed
             * is a day, and an instant would make it owed at a time.
             * `assessmentMetrics` is null where the client has never been given
             * a sheet of their own, which reads as the trainer's default.
             */
            Integer assessmentIntervalDays,
            String nextAssessmentOn,
            List<String> assessmentMetrics,
            /*
             * ── APPENDED BY V7 · PHYSICAL INFORMATION ────────────────────────
             * An ISO date or null. The age beside it on the client file is
             * derived on read by the web, never stored, so it cannot go stale.
             */
            String dateOfBirth
    ) {}

    /**
     * One body reading, read out of a completed assessment (V22). {@code id} is
     * that assessment's id — kept under its old name so the web's readers did
     * not change — and so is shared by up to six readings; {@code notes} is
     * always null and {@code recordedAt} / {@code createdAt} are both the
     * assessment's {@code completed_at}.
     */
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
            Boolean pinned,
            /** V7. Null leaves alone (on create: private). Only TRUE shares. */
            Boolean sharedWithClient
    ) {}

    public record NoteResponse(
            UUID id,
            UUID clientId,
            String body,
            boolean pinned,
            long createdAt,
            long updatedAt,
            /** V7 · appended last. The client this note is about may read it. */
            boolean sharedWithClient
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
        // 0 clears (V7): null already means "leave it alone", and no person is
        // zero centimetres tall, so the sentinel cannot collide with an answer.
        if (req.heightCm() != null)            client.setHeightCm(req.heightCm().signum() == 0 ? null : req.heightCm());
        if (req.dateOfBirth() != null)         client.setDateOfBirth(birthDate(req.dateOfBirth()));
        if (req.activityLevel() != null)            client.setActivityLevel(req.activityLevel());
        if (req.metadata() != null)                 client.setMetadata(req.metadata());
        if (req.sessionsPerWeek() != null)          client.setSessionsPerWeek(req.sessionsPerWeek());
        if (req.sessionDurationMinutes() != null)   client.setSessionDurationMinutes(req.sessionDurationMinutes());
        /* THE RHYTHM, AND THE DIARY THAT FOLLOWS IT.
         *
         * `sessions_per_week` is kept in step in the same breath because it is
         * the same fact counted: the portal's progress screen reads it as *the
         * agreed frequency* and draws "3 of 4 this week" from it, so a client who
         * moved to four days while that column still said three is told they are
         * behind on a week they finished. Normalised through `SessionPlanner` so
         * one slot per weekday and the ordinal numbering are the same here as on
         * every other writer of this column — the phone's `serializeWeeklySchedule`
         * makes the identical three decisions.
         *
         * The reconcile itself is after the save, below: it reads the client row
         * back, so it has to see the new week. */
        boolean rhythmChanged = false;
        if (req.weeklySchedule() != null) {
            var slots = SessionPlanner.parseSlots(req.weeklySchedule());
            client.setWeeklySchedule(slots.stream()
                    .map(s -> Map.<String, Object>of("templateDay", s.templateDay(),
                                                     "weekday", s.weekday(),
                                                     "time", s.time()))
                    .toList());
            if (!slots.isEmpty()) {
                client.setSessionsPerWeek(slots.size());
                rhythmChanged = true;
            }
        }
        // An empty string clears it back to "never said" — the same convention
        // the trainer profile endpoint uses for its skippable fields.
        if (req.deliveryMode() != null)             client.setDeliveryMode(deliveryMode(req.deliveryMode()));
        applyAssessmentCycle(client, req);
        /* FLUSHED, NOT MERELY SAVED, AND ONLY WHEN THE DIARY IS ABOUT TO READ IT.
         *
         * `DiaryService` reads `client.weekly_schedule` back over JDBC, and JPA
         * defers its flush to commit — so the reconcile below would lay the diary
         * out from the week this call just REPLACED. Found by test: the days
         * moved, the sessions did not.
         *
         * `saveAndFlush` only on the path that needs it. Every other field on this
         * request is read back through the entity, which is already current in the
         * persistence context, and forcing a flush for a name change would buy a
         * round trip for nothing. */
        if (rhythmChanged) clientRepo.saveAndFlush(client); else clientRepo.save(client);
        /* `updateClientSchedule` is the only caller that sends `weeklySchedule`,
           and it is step 3 of the add-a-client flow: the days are agreed AFTER the
           pack is sold on step 2, so without this the very first client a trainer
           adds is the one whose pack books nothing. `DiaryService.reconcile`
           carries the three-pass rule that keeps a hand-booked session and a
           typed note through the change. */
        DiaryService.Result booked = rhythmChanged
                ? diary.reconcile(trainerId, clientId.toString())
                : null;
        var flags = computeStatusFlags(trainerId, List.of(clientId.toString()))
                .getOrDefault(clientId, new StatusFlags(false, false, false));
        return toResponse(client, flags, booked);
    }

    @Transactional
    public void delete(UUID trainerId, UUID clientId) {
        var client = findOwned(trainerId, clientId);
        client.setDeletedAt(Instant.now());
        clientRepo.save(client);
    }

    // ── Body metrics ──────────────────────────────────────────────────────────

    /** Newest first. Readings exist only on assessments — see {@link MetricReadings}. */
    public List<BodyMetricResponse> listMetrics(UUID trainerId, UUID clientId) {
        findOwned(trainerId, clientId);
        return metricReadings.newestFirst(clientId).stream().map(this::toMetricResponse).toList();
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
        // Only an explicit TRUE shares: a missing field on create is a private
        // note, which is what every note was before V7.
        note.setSharedWithClient(Boolean.TRUE.equals(req.sharedWithClient()));
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
        if (req.sharedWithClient() != null) note.setSharedWithClient(req.sharedWithClient());
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

    /**
     * V5 · how often this client is measured, and when the next one is owed.
     *
     * Setting a cadence on somebody with no date yet SEEDS one, because a
     * trainer who answered "every four weeks" has said something that should
     * produce a day; leaving it null would make the answer inert. Sending the
     * date explicitly always wins — that is how the add flow says "take it at
     * the first session".
     */
    private void applyAssessmentCycle(Client client, UpdateClientRequest req) {
        if (req.assessmentIntervalDays() != null) {
            Short days = MeasurementService.validInterval(req.assessmentIntervalDays());
            client.setAssessmentIntervalDays(days);
            if (days == null) {
                client.setNextAssessmentOn(null);
            } else if (client.getNextAssessmentOn() == null && req.nextAssessmentOn() == null) {
                client.setNextAssessmentOn(LocalDate.now(IST).plusDays(days));
            }
        }
        if (req.nextAssessmentOn() != null) {
            client.setNextAssessmentOn(req.nextAssessmentOn().isBlank()
                    ? null : LocalDate.parse(req.nextAssessmentOn()));
        }
        if (req.assessmentMetrics() != null) {
            var ids = MeasurementService.validMetrics(req.assessmentMetrics());
            client.setAssessmentMetrics(ids == null || ids.isEmpty() ? null : ids);
        }
    }

    /**
     * V7 · a birth date, or "" to clear it.
     *
     * Refused rather than stored when it is not a real date, is in the future,
     * or is more than 120 years ago — each of those is a typo (the year keyed
     * as 2091, or 1896 for 1996), and a card that then prints "age −65" or
     * "age 130" is worse than a 400 that says which.
     */
    private static LocalDate birthDate(String raw) {
        if (raw.isBlank()) return null;
        LocalDate date;
        try {
            date = LocalDate.parse(raw.trim());
        } catch (java.time.format.DateTimeParseException e) {
            throw ClientRuleException.validation("dateOfBirth: must be a date, YYYY-MM-DD");
        }
        LocalDate today = LocalDate.now(IST);
        if (date.isAfter(today)) {
            throw ClientRuleException.validation("dateOfBirth: that date is in the future");
        }
        if (date.isBefore(today.minusYears(120))) {
            throw ClientRuleException.validation("dateOfBirth: that is more than 120 years ago");
        }
        return date;
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
            throw ClientRuleException.validation("A note needs some text");
        }
        if (body.length() > NOTE_MAX) {
            throw ClientRuleException.validation("A note is capped at " + NOTE_MAX + " characters");
        }
        return body;
    }

    private NoteResponse toNoteResponse(ClientNote n) {
        return new NoteResponse(
                n.getId(), n.getClientId(), n.getBody(), n.isPinned(),
                n.getCreatedAt().toEpochMilli(), n.getUpdatedAt().toEpochMilli(),
                n.isSharedWithClient()
        );
    }

    private ClientResponse toResponse(Client c, StatusFlags flags) {
        return toResponse(c, flags, null);
    }

    /**
     * The same row, plus what a rhythm change just did to the diary.
     *
     * An overload rather than a third argument on the only caller, because every
     * other path through this class answers a READ — and a read books nothing,
     * so `null` is the honest value and passing it explicitly four times would
     * invite somebody to pass a zero instead.
     */
    private ClientResponse toResponse(Client c, StatusFlags flags, DiaryService.Result diary) {
        return new ClientResponse(
                c.getId(), c.getTrainerId(), c.getName(), c.getPhone(), c.getGoal(),
                c.getStatus(), c.getPaymentMode(), c.getTrainerSplitPercent(), c.getHeightCm(),
                c.getActivityLevel(), c.getMetadata(),
                c.getSessionsPerWeek(), c.getSessionDurationMinutes(), c.getWeeklySchedule(),
                c.getDeliveryMode(),
                flags,
                c.getCreatedAt().toEpochMilli(), c.getUpdatedAt().toEpochMilli(),
                c.getMembershipStatus(),
                diary == null ? null : diary.booked(),
                diary == null ? null : diary.firstAt(),
                c.getAssessmentIntervalDays() == null ? null : (int) (short) c.getAssessmentIntervalDays(),
                c.getNextAssessmentOn() == null ? null : c.getNextAssessmentOn().toString(),
                c.getAssessmentMetrics(),
                c.getDateOfBirth() == null ? null : c.getDateOfBirth().toString()
        );
    }

    private BodyMetricResponse toMetricResponse(MetricReadings.MetricReading m) {
        long at = m.recordedAt().toEpochMilli();
        return new BodyMetricResponse(
                m.assessmentId(), m.clientId(), m.metricType(), m.value(), m.unit(), null, at, at);
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
