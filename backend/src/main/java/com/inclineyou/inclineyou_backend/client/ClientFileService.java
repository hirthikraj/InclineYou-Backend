package com.inclineyou.inclineyou_backend.client;

import com.fasterxml.jackson.annotation.JsonUnwrapped;
import com.inclineyou.inclineyou_backend.assessment.MetricCatalogue;
import com.inclineyou.inclineyou_backend.assessment.MetricReadings;
import com.inclineyou.inclineyou_backend.exception.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
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

    private final NamedParameterJdbcTemplate jdbc;
    private final ClientSummaryService summaries;
    private final MetricReadings readings;

    public record PinnedNote(String id, String body, long updatedAt) {}

    /** The L3 summary row, flattened, plus the client's own fields and the pinned notes the header draws. */
    public record ClientDetail(
            @JsonUnwrapped ClientSummaryService.ClientSummary summary,
            String dateOfBirth,
            BigDecimal heightCm,
            String activityLevel,
            String goal,
            List<PinnedNote> pinnedNotes
    ) {
        /**
         * The ETag, and deliberately NOT {@code version}: {@code version} is
         * {@code client.updated_at}, the If-Match for a PATCH, and a pinned note or
         * a session marked done changes this response without touching that
         * column. A hash of the whole answer is the only tag a 304 can trust.
         */
        public String etag() {
            try {
                var md = MessageDigest.getInstance("SHA-256").digest(toString().getBytes(StandardCharsets.UTF_8));
                return HexFormat.of().formatHex(md, 0, 12);
            } catch (NoSuchAlgorithmException e) {
                throw new IllegalStateException(e);
            }
        }
    }

    /** An archived client still opens; 404 only when not yours. */
    public ClientDetail get(UUID trainerId, UUID clientId) {
        var summary = summaries.one(trainerId, clientId)
                .orElseThrow(() -> ApiException.notFound("That client is not on your roster."));
        var p = Map.of("cid", clientId.toString());
        var own = jdbc.queryForMap("""
                SELECT date_of_birth::text AS dob, height_cm, activity_level, goal FROM client WHERE id = :cid::uuid
                """, p);
        var pinned = jdbc.query("""
                SELECT id::text AS id, body, updated_at FROM client_note
                WHERE client_id = :cid::uuid AND pinned AND deleted_at IS NULL
                ORDER BY updated_at DESC, id
                """, p, (rs, i) -> new PinnedNote(rs.getString("id"), rs.getString("body"),
                rs.getTimestamp("updated_at").getTime()));
        return new ClientDetail(summary, (String) own.get("dob"), (BigDecimal) own.get("height_cm"),
                (String) own.get("activity_level"), (String) own.get("goal"), pinned);
    }

    public record Reading(String assessmentId, String key, String label, String unit, BigDecimal value, long at) {}

    /** Oldest first (at, assessmentId, key), out of completed assessments. Bounded: one row per key per assessment. */
    public List<Reading> readings(UUID trainerId, UUID clientId, String key) {
        requireOwned(trainerId, clientId);
        Set<String> keys = null;
        if (key != null && !key.isBlank()) {
            keys = new java.util.HashSet<>();
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
        Boolean mine = jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM client WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)
                """, Map.of("cid", clientId.toString(), "tid", trainerId.toString()), Boolean.class);
        if (!Boolean.TRUE.equals(mine)) throw ApiException.notFound("That client is not on your roster.");
    }
}
