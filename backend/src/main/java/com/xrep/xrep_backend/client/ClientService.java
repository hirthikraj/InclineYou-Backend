package com.xrep.xrep_backend.client;

import com.xrep.xrep_backend.entity.BodyMetric;
import com.xrep.xrep_backend.entity.Client;
import com.xrep.xrep_backend.repository.BodyMetricRepository;
import com.xrep.xrep_backend.repository.ClientRepository;
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


import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
@RequiredArgsConstructor
public class ClientService {

    private final ClientRepository clientRepo;
    private final BodyMetricRepository bodyMetricRepo;
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
            long updatedAt
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
        // One phone, one person, one place — a trainer's number, another
        // trainer's client and a duplicate on this trainer's own roster are all
        // refused outright here. See ClientPhoneGuard.
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

    private ClientResponse toResponse(Client c, StatusFlags flags) {
        return new ClientResponse(
                c.getId(), c.getTrainerId(), c.getName(), c.getPhone(), c.getGoal(),
                c.getStatus(), c.getPaymentMode(), c.getTrainerSplitPercent(), c.getHeightCm(),
                c.getActivityLevel(), c.getMetadata(),
                c.getSessionsPerWeek(), c.getSessionDurationMinutes(), c.getWeeklySchedule(),
                c.getDeliveryMode(),
                flags,
                c.getCreatedAt().toEpochMilli(), c.getUpdatedAt().toEpochMilli()
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
