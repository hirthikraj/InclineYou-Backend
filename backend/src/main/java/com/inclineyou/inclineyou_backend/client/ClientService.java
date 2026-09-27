package com.inclineyou.inclineyou_backend.client;

import com.inclineyou.inclineyou_backend.assessment.MetricReadings;
import com.inclineyou.inclineyou_backend.session.SessionPlanner;
import com.inclineyou.inclineyou_backend.entity.Client;
import com.inclineyou.inclineyou_backend.entity.ClientNote;
import com.inclineyou.inclineyou_backend.repository.ClientNoteRepository;
import com.inclineyou.inclineyou_backend.repository.ClientRepository;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;
import java.util.stream.Collectors;


import static org.springframework.http.HttpStatus.NOT_FOUND;

/**
 * The client row and the trainer's notes on it, on the v1 schema.
 *
 * <p>{@link ClientResponse} keeps the pre-v1 wire shape on purpose: a dozen web
 * screens still read {@code GET /v1/clients} in that shape while they move to
 * {@code ?view=summary} (api-contract *Clients*). So the fields are now read from
 * where v1 keeps them — the rhythm from {@code client_schedule} and
 * {@code client_schedule_slot} — and the ones whose columns v1 dropped
 * ({@code paymentMode}, {@code trainerSplitPercent}, the measuring cycle) are
 * always null rather than removed from the response.
 */
@Service
@RequiredArgsConstructor
public class ClientService {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    private final ClientRepository clientRepo;
    private final MetricReadings metricReadings;
    private final ClientNoteRepository clientNoteRepo;
    private final ClientPhoneGuard phoneGuard;
    private final NamedParameterJdbcTemplate jdbc;

    private static final Set<String> CLIENT_TYPES = Set.of("independent", "gym");
    private static final Set<String> STATUSES = Set.of("active", "paused", "inactive", "archived");

    // ── DTOs ──────────────────────────────────────────────────────────────────

    public record CreateClientRequest(
            @NotBlank String name,
            String phone,
            String goal,
            /** {@code independent} (the default) | {@code gym}. */
            String clientType,
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
            String clientType,
            BigDecimal heightCm,
            String activityLevel,
            Map<String, Object> metadata,
            Integer sessionsPerWeek,
            Integer sessionDurationMinutes,
            List<Map<String, Object>> weeklySchedule,
            String deliveryMode,
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
            /** Always null in v1 — the split is set per package (R3). */
            String paymentMode,
            /** Always null in v1 — see {@code paymentMode}. */
            BigDecimal trainerSplitPercent,
            BigDecimal heightCm,
            String activityLevel,
            Map<String, Object> metadata,
            /* The rhythm — `client_schedule` in v1. */
            Integer sessionsPerWeek,
            Integer sessionDurationMinutes,
            /**
             * `client_schedule_slot`, as `[{templateDay, weekday, time}]`. v1 stores
             * no program day on a slot (R45 is pending), so `templateDay` is the
             * slot's ordinal in the week.
             */
            List<Map<String, Object>> weeklySchedule,
            String deliveryMode,
            StatusFlags statusFlags,
            long createdAt,
            long updatedAt,
            String membershipStatus,
            /** What a write booked in the diary. Always null until the schedule write moves to v1. */
            Integer sessionsBooked,
            Long firstSessionAt,
            /* The measuring cycle moved to `assessment_schedule` — always null here. */
            Integer assessmentIntervalDays,
            String nextAssessmentOn,
            List<String> assessmentMetrics,
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
       record whatever it is called. Notes shared with the client are out of v1,
       so a note is only ever the trainer's. */

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

    /** A client's rhythm: the `client_schedule` row and its live slots. */
    private record Rhythm(Integer sessionsPerWeek, Integer sessionDurationMinutes, String deliveryMode,
                          List<Map<String, Object>> weeklySchedule) {}

    private static final Rhythm NO_RHYTHM = new Rhythm(null, null, null, List.of());

    // ── Client CRUD ───────────────────────────────────────────────────────────

    public List<ClientResponse> list(UUID trainerId) {
        var clients = clientRepo.findByTrainerIdAndDeletedAtIsNullOrderByCreatedAtDesc(trainerId);
        if (clients.isEmpty()) return List.of();

        var idStrings = clients.stream().map(c -> c.getId().toString()).toList();
        var flagMap = computeStatusFlags(trainerId, idStrings);
        var rhythms = rhythms(idStrings);

        return clients.stream()
                .map(c -> toResponse(c,
                        flagMap.getOrDefault(c.getId(), new StatusFlags(false, false, false)),
                        rhythms.getOrDefault(c.getId(), NO_RHYTHM)))
                .toList();
    }

    public ClientResponse get(UUID trainerId, UUID clientId) {
        return respond(trainerId, findOwned(trainerId, clientId));
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
        client.setClientType(clientType(req.clientType(), "independent"));
        client.setHeightCm(req.heightCm());
        client.setActivityLevel(req.activityLevel());
        client.setMetadata(req.metadata());
        // Flushed, because `ensure_client_schedule` creates the schedule row on
        // INSERT and the update below has to find it.
        clientRepo.saveAndFlush(client);
        writeSchedule(client.getId(), req.sessionsPerWeek(), req.sessionDurationMinutes(), req.deliveryMode());
        return respond(trainerId, client);
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
        if (req.status() != null)              applyStatus(client, req.status());
        if (req.clientType() != null)          client.setClientType(clientType(req.clientType(), client.getClientType()));
        // 0 clears (V7): null already means "leave it alone", and no person is
        // zero centimetres tall, so the sentinel cannot collide with an answer.
        if (req.heightCm() != null)            client.setHeightCm(req.heightCm().signum() == 0 ? null : req.heightCm());
        if (req.dateOfBirth() != null)         client.setDateOfBirth(birthDate(req.dateOfBirth()));
        if (req.activityLevel() != null)       client.setActivityLevel(req.activityLevel());
        if (req.metadata() != null)            client.setMetadata(req.metadata());
        clientRepo.save(client);

        /* THE RHYTHM. `sessions_per_week` is kept in step with the slots because
           it is the same fact counted, normalised through `SessionPlanner` so one
           slot per weekday is the rule here as on every other writer. The diary is
           NOT re-laid from here: `DiaryService` still reads the pre-v1
           `client.weekly_schedule`, and booking the week belongs to the contract's
           `PUT /v1/clients/{id}/schedule`. */
        Integer perWeek = req.sessionsPerWeek();
        if (req.weeklySchedule() != null) {
            var slots = SessionPlanner.parseSlots(req.weeklySchedule());
            replaceSlots(clientId, slots);
            if (!slots.isEmpty()) perWeek = slots.size();
        }
        writeSchedule(clientId, perWeek, req.sessionDurationMinutes(), req.deliveryMode());
        return respond(trainerId, client);
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
     * 'floor' | 'home_visit' | 'remote' | null — the schema's three modes.
     *
     * Anything else is stored as null rather than rejected with a 400: a caller
     * sending a mode this build doesn't know about should lose one optional
     * field, not have its whole write fail.
     */
    private static String deliveryMode(String raw) {
        if (raw == null) return null;
        String value = raw.trim().toLowerCase();
        return value.equals("floor") || value.equals("home_visit") || value.equals("remote") ? value : null;
    }

    private static String clientType(String raw, String fallback) {
        if (raw == null) return fallback;
        String value = raw.trim().toLowerCase();
        if (!CLIENT_TYPES.contains(value)) {
            throw ClientRuleException.validation("clientType: must be independent or gym");
        }
        return value;
    }

    /**
     * A status change carries its timestamps, because `client_status_dates` ties
     * `paused` to `paused_at` and `archived` to `archived_at` — and
     * `client_archive` wants a reason beside the date. The contract's pause,
     * resume and archive verbs will replace this path; until then an archive
     * through here is recorded with reason `other`.
     */
    private static void applyStatus(Client client, String raw) {
        String status = raw.trim().toLowerCase();
        if (!STATUSES.contains(status)) {
            throw ClientRuleException.validation("status: must be active, paused, inactive or archived");
        }
        if (status.equals(client.getStatus())) return;
        Instant now = Instant.now();
        client.setStatus(status);
        client.setPausedAt("paused".equals(status) ? now : null);
        if (!"paused".equals(status)) client.setPausedUntil(null);
        if ("archived".equals(status)) {
            client.setArchivedAt(now);
            client.setArchiveReason("other");
        } else {
            client.setArchivedAt(null);
            client.setArchiveReason(null);
            client.setArchiveNote(null);
        }
    }

    /** Each argument null leaves that column alone. The row itself always exists (`ensure_client_schedule`). */
    private void writeSchedule(UUID clientId, Integer perWeek, Integer minutes, String mode) {
        var sets = new ArrayList<String>();
        var p = new HashMap<String, Object>();
        p.put("cid", clientId.toString());
        if (perWeek != null) { p.put("perWeek", perWeek); sets.add("sessions_per_week = :perWeek"); }
        if (minutes != null) { p.put("minutes", minutes); sets.add("session_duration_minutes = :minutes"); }
        // An empty string clears it back to "never said".
        if (mode != null)    { p.put("mode", deliveryMode(mode)); sets.add("delivery_mode = :mode"); }
        if (sets.isEmpty()) return;
        jdbc.update("UPDATE client_schedule SET " + String.join(", ", sets) + ", updated_at = now() "
                + "WHERE client_id = :cid::uuid", p);
    }

    /** The whole week replaced: live slots soft-deleted, the new ones inserted. */
    private void replaceSlots(UUID clientId, List<SessionPlanner.Slot> slots) {
        var p = new HashMap<String, Object>();
        p.put("cid", clientId.toString());
        jdbc.update("""
                UPDATE client_schedule_slot SET deleted_at = now(), updated_at = now()
                WHERE client_id = :cid::uuid AND deleted_at IS NULL
                """, p);
        for (var slot : slots) {
            p.put("weekday", slot.weekday());
            p.put("start", slot.time());
            jdbc.update("""
                    INSERT INTO client_schedule_slot (client_id, weekday, start_time)
                    VALUES (:cid::uuid, :weekday, CAST(:start AS time))
                    """, p);
        }
    }

    /** One client's response, with its flags and rhythm read fresh. */
    private ClientResponse respond(UUID trainerId, Client client) {
        String id = client.getId().toString();
        var flags = computeStatusFlags(trainerId, List.of(id))
                .getOrDefault(client.getId(), new StatusFlags(false, false, false));
        return toResponse(client, flags, rhythms(List.of(id)).getOrDefault(client.getId(), NO_RHYTHM));
    }

    /** Schedule rows and live slots for a batch of clients, in two queries. */
    private Map<UUID, Rhythm> rhythms(List<String> clientIds) {
        var p = Map.of("ids", clientIds);
        var slots = new HashMap<UUID, List<Map<String, Object>>>();
        jdbc.query("""
                SELECT client_id::text AS client_id, weekday, to_char(start_time, 'HH24:MI') AS start_hm
                FROM client_schedule_slot
                WHERE client_id::text IN (:ids) AND deleted_at IS NULL
                ORDER BY client_id, weekday, start_time
                """, p, rs -> {
            var list = slots.computeIfAbsent(UUID.fromString(rs.getString("client_id")), k -> new ArrayList<>());
            list.add(Map.of("templateDay", list.size() + 1,
                            "weekday", rs.getInt("weekday"),
                            "time", rs.getString("start_hm")));
        });
        var out = new HashMap<UUID, Rhythm>();
        jdbc.query("""
                SELECT client_id::text AS client_id, sessions_per_week, session_duration_minutes, delivery_mode
                FROM client_schedule WHERE client_id::text IN (:ids)
                """, p, rs -> {
            UUID id = UUID.fromString(rs.getString("client_id"));
            out.put(id, new Rhythm(intOrNull(rs, "sessions_per_week"), intOrNull(rs, "session_duration_minutes"),
                    rs.getString("delivery_mode"), slots.getOrDefault(id, List.of())));
        });
        return out;
    }

    private static Integer intOrNull(ResultSet rs, String column) throws SQLException {
        int v = rs.getInt(column);
        return rs.wasNull() ? null : v;
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
                n.getCreatedAt().toEpochMilli(), n.getUpdatedAt().toEpochMilli());
    }

    private ClientResponse toResponse(Client c, StatusFlags flags, Rhythm rhythm) {
        return new ClientResponse(
                c.getId(), c.getTrainerId(), c.getName(), c.getPhone(), c.getGoal(),
                c.getStatus(), null, null, c.getHeightCm(),
                c.getActivityLevel(), c.getMetadata(),
                rhythm.sessionsPerWeek(), rhythm.sessionDurationMinutes(), rhythm.weeklySchedule(),
                rhythm.deliveryMode(),
                flags,
                c.getCreatedAt().toEpochMilli(), c.getUpdatedAt().toEpochMilli(),
                c.getMembershipStatus(),
                null, null,
                null, null, null,
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
