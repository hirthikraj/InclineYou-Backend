package com.inclineyou.inclineyou_backend.client;

import com.inclineyou.inclineyou_backend.entity.Client;
import com.inclineyou.inclineyou_backend.repository.ClientRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.*;
import java.util.stream.Collectors;


/**
 * {@code GET /v1/clients?view=legacy} — the pre-v1 roster row, on the v1 schema.
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

    private final ClientRepository clientRepo;
    private final NamedParameterJdbcTemplate jdbc;

    // ── DTOs ──────────────────────────────────────────────────────────────────

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

    /** A client's rhythm: the `client_schedule` row and its live slots. */
    private record Rhythm(Integer sessionsPerWeek, Integer sessionDurationMinutes, String deliveryMode,
                          List<Map<String, Object>> weeklySchedule) {}

    private static final Rhythm NO_RHYTHM = new Rhythm(null, null, null, List.of());

    // ── The legacy list ───────────────────────────────────────────────────────────

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
