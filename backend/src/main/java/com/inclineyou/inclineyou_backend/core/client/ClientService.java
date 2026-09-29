package com.inclineyou.inclineyou_backend.core.client;

import com.inclineyou.inclineyou_backend.core.client.dto.ClientResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

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
    private final ClientJdbcRepository jdbcRepo;

    private static final ClientJdbcRepository.Rhythm NO_RHYTHM =
            new ClientJdbcRepository.Rhythm(null, null, null, List.of());

    public List<ClientResponse> list(UUID trainerId) {
        var clients = clientRepo.findByTrainerIdAndDeletedAtIsNullOrderByCreatedAtDesc(trainerId);
        if (clients.isEmpty()) return List.of();

        var ids = clients.stream().map(c -> c.getId().toString()).toList();
        // Three targeted queries for the flags, two for the rhythm, whatever the roster size.
        var paymentDue = jdbcRepo.withPaymentDue(trainerId, ids);
        var packLow = jdbcRepo.withPackLow(trainerId, ids);
        var planExpiring = jdbcRepo.withPlanExpiring(trainerId, ids);
        var rhythms = jdbcRepo.rhythms(ids);

        return clients.stream().map(c -> {
            var flags = new ClientResponse.StatusFlags(paymentDue.contains(c.getId()), packLow.contains(c.getId()),
                    planExpiring.contains(c.getId()));
            return toResponse(c, flags, rhythms.getOrDefault(c.getId(), NO_RHYTHM));
        }).toList();
    }

    private static ClientResponse toResponse(Client c, ClientResponse.StatusFlags flags,
                                             ClientJdbcRepository.Rhythm rhythm) {
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
}
