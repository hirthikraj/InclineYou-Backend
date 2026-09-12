package com.inclineyou.inclineyou_backend.trainer;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The trainer's working week, as a read.
 *
 * ── WHY THIS EXISTS, AND WHY IT IS A READ ONLY ────────────────────────────────
 *
 * `working_hours` (V10) had no REST route at all. It reached the wire only inside
 * the WatermelonDB envelope, because the only client that had ever needed it was
 * the phone, and the phone gets it on its cursor along with everything else.
 *
 * The web's Today screen cannot be drawn without it. The day ribbon's ground is
 * the working windows; the hole between two shifts is the shape of a split-shift
 * day; and a *sellable gap* is by definition free time INSIDE a window — with no
 * windows there is no gap, no price on it, and no "your morning ends at 12:00".
 * The alternative was `/v1/sync/pull`, which for an established trainer carries
 * the 1,324-row exercise library and every set log ever recorded, on a screen
 * that is opened every morning and left open.
 *
 * **Read only, deliberately.** Setup writes these rows through `/v1/sync/push`
 * (see the web's `lib/setup/api.ts`) and the per-day editor lives in the diary on
 * the phone. Adding a write path here would make two, and a permission-shaped
 * table with two write paths is how the two halves drift. Nothing on Today edits
 * the working week; it only needs to know what it is.
 *
 * Not folded into `TrainerService` because that one is JPA over the `trainer`
 * aggregate and this is a separate table with its own lifecycle — the same
 * division `PackageService` already draws.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class WorkingHoursService {

    private final NamedParameterJdbcTemplate jdbc;

    /**
     * OWNED, NOT INJECTED — and that is a CI decision, not a style one.
     *
     * `@RequiredArgsConstructor` on an `ObjectMapper` field makes this service
     * require the bean, and this service is component-scanned, so every Spring
     * slice that scans the package has to be able to supply one. Sixteen sync
     * tests failed to start their context on exactly that: `No qualifying bean of
     * type ObjectMapper`. They would have failed the same way in CI, where the
     * suite is the whole gate.
     *
     * There is nothing to configure here anyway. This reads one small object out of
     * a `jsonb` column; it does not serialise a response — Spring's own configured
     * mapper does that, at the HTTP boundary, and stays the only one whose settings
     * a caller can observe. A private static instance is thread-safe for reads.
     */
    private static final ObjectMapper JSON = new ObjectMapper();

    private static final TypeReference<Map<String, Object>> MAP = new TypeReference<>() {};

    /**
     * @param weekday 0 = Monday … 6 = Sunday. ISO order, matching the column and
     *                the day strip on both halves — NOT {@code Date.getDay()},
     *                where Sunday is 0. A caller converting from a JS date has
     *                to shift, and the field name says which convention won.
     */
    public record WorkingHourResponse(
            String id,
            int weekday,
            int startMinute,
            int endMinute,
            Map<String, Object> metadata,
            long createdAt,
            long updatedAt
    ) {}

    /**
     * Every window, in the order a week is read.
     *
     * A split shift is TWO ROWS on one weekday and that is the point of the
     * table — one range per day would claim the trainer is free for lunch. So
     * the sort is (weekday, start_minute) and callers merge overlaps themselves;
     * both halves already own that function (`mergeWindows`).
     *
     * A trainer who has never answered the hours step gets an empty list rather
     * than a default week. Inventing 06:00–11:00 here would put a working window
     * on a ribbon for a trainer who never said so, and a gap inside it priced at
     * a rate they never set.
     */
    public List<WorkingHourResponse> list(UUID trainerId) {
        /*
         * `metadata::text`, and the cast is the whole point.
         *
         * Plain JDBC hands a `jsonb` column back as the driver's `PGobject`, not as
         * a `Map` — `ClientResponse` gets a real map only because it goes through
         * JPA and a converter. The first version of this method tested
         * `instanceof Map` and fell back to `Map.of()`, so a row holding
         * `{"note": "..."}` came back as `{}`: not an error, not a log line, just
         * the wrong answer, indistinguishable from a row with no metadata. Casting
         * to text and parsing makes the failure mode explicit instead.
         */
        var rows = jdbc.queryForList("""
                SELECT id::text, weekday, start_minute, end_minute, metadata::text AS metadata,
                       created_at, updated_at
                FROM working_hours
                WHERE trainer_id = :tid::uuid AND deleted_at IS NULL
                ORDER BY weekday ASC, start_minute ASC
                """, Map.of("tid", trainerId.toString()));

        return rows.stream().map(this::toResponse).toList();
    }

    private WorkingHourResponse toResponse(Map<String, Object> r) {
        return new WorkingHourResponse(
                String.valueOf(r.get("id")),
                ((Number) r.get("weekday")).intValue(),
                ((Number) r.get("start_minute")).intValue(),
                ((Number) r.get("end_minute")).intValue(),
                readMetadata(r.get("metadata")),
                epoch(r.get("created_at")),
                epoch(r.get("updated_at")));
    }

    /**
     * The column is `JSONB NOT NULL DEFAULT '{}'`, so the empty map is the normal
     * answer and not a failure. Unparseable content is logged and answered as
     * empty rather than thrown: metadata is a side-car on a window, and the
     * working week is what the caller asked for — failing the whole request over a
     * malformed side-car would blank a trainer's day.
     */
    private Map<String, Object> readMetadata(Object raw) {
        if (raw == null) return Map.of();
        String text = raw.toString();
        if (text.isBlank()) return Map.of();
        try {
            Map<String, Object> parsed = JSON.readValue(text, MAP);
            return parsed != null ? parsed : Map.of();
        } catch (Exception e) {
            log.warn("working_hours.metadata is not an object: {}", text, e);
            return Map.of();
        }
    }

    private long epoch(Object v) {
        if (v instanceof java.sql.Timestamp ts) return ts.toInstant().toEpochMilli();
        if (v instanceof java.time.OffsetDateTime odt) return odt.toInstant().toEpochMilli();
        if (v instanceof java.time.Instant i) return i.toEpochMilli();
        return 0L;
    }
}
