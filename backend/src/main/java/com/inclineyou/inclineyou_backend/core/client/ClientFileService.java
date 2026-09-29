package com.inclineyou.inclineyou_backend.core.client;

import com.inclineyou.inclineyou_backend.core.assessment.MetricCatalogue;
import com.inclineyou.inclineyou_backend.core.assessment.MetricReadings;
import com.inclineyou.inclineyou_backend.core.client.dto.ClientDetail;
import com.inclineyou.inclineyou_backend.core.client.dto.Reading;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * api-contract 1.1 Client file — the header every tab draws
 * ({@code GET /v1/clients/{id}}) and the measurement history
 * ({@code GET /v1/clients/{id}/readings}).
 */
@Service
@RequiredArgsConstructor
public class ClientFileService {

    private final ClientJdbcRepository clients;
    private final ClientNoteJdbcRepository notes;
    private final ClientSummaryService summaries;
    private final MetricReadings readings;

    /** An archived client still opens; 404 only when not yours. */
    public ClientDetail get(UUID trainerId, UUID clientId) {
        var summary = summaries.one(trainerId, clientId)
                .orElseThrow(() -> ApiException.notFound("That client is not on your roster."));
        var own = clients.ownFields(clientId);
        return new ClientDetail(summary, own.dateOfBirth(), own.heightCm(), own.activityLevel(), own.goal(),
                notes.pinned(clientId));
    }

    /** Oldest first (at, assessmentId, key), out of completed assessments. Bounded: one row per key per assessment. */
    public List<Reading> readings(UUID trainerId, UUID clientId, String key) {
        requireOwned(trainerId, clientId);
        Set<String> keys = null;
        if (key != null && !key.isBlank()) {
            keys = new HashSet<>();
            for (String k : key.split(",")) {
                if (!MetricCatalogue.has(k.strip())) throw ApiException.validation("key: unknown measurement " + k.strip());
                keys.add(k.strip());
            }
        }
        final Set<String> wanted = keys;
        return readings.oldestFirst(clientId).stream()
                .filter(r -> wanted == null || wanted.contains(r.metricType()))
                .map(r -> new Reading(r.assessmentId().toString(), r.metricType(),
                        MetricCatalogue.get(r.metricType()).label(), r.unit(), r.value(), r.recordedAt().toEpochMilli()))
                .toList();
    }

    void requireOwned(UUID trainerId, UUID clientId) {
        if (!clients.isOwned(trainerId, clientId)) throw ApiException.notFound("That client is not on your roster.");
    }
}
