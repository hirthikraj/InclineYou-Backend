package com.inclineyou.inclineyou_backend.core.trainer.hours;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The trainer's working week, as a read — api-contract Today L2.
 *
 * <p>The day ribbon's ground is the working windows; the hole between two shifts
 * is the shape of a split-shift day; and a <i>sellable gap</i> is by definition
 * free time INSIDE a window — with no windows there is no gap. So Today cannot be
 * drawn without this, and the Schedule and the profile's Work &amp; hours tab read
 * the same shape.
 *
 * <p>Not folded into {@code TrainerService} because that one is JPA over the
 * {@code trainer} aggregate and this is a separate table with its own lifecycle.
 */
@Service
@RequiredArgsConstructor
public class WorkingHoursService {

    private final NamedParameterJdbcTemplate jdbc;

    /**
     * @param weekday 1 = Monday … 7 = Sunday, the schema's own numbering.
     * @param start   {@code "HH:mm"} — the columns are {@code time} in v1, so the
     *                old {@code startMinute} integers are gone from the wire.
     */
    public record WorkingHourResponse(String id, int weekday, String start, String end) {}

    /**
     * Every window, in the order a week is read.
     *
     * <p>A split shift is TWO ROWS on one weekday and that is the point of the
     * table — one range per day would claim the trainer is free for lunch.
     *
     * <p>A trainer who has never answered the hours step gets an empty list rather
     * than a default week. Inventing 06:00–11:00 here would put a working window
     * on a ribbon for a trainer who never said so.
     */
    public List<WorkingHourResponse> list(UUID trainerId) {
        return jdbc.query("""
                SELECT id::text AS id, weekday,
                       to_char(start_time, 'HH24:MI') AS start_hm,
                       to_char(end_time, 'HH24:MI') AS end_hm
                FROM working_hours
                WHERE trainer_id = :tid::uuid AND deleted_at IS NULL
                ORDER BY weekday, start_time, id
                """, Map.of("tid", trainerId.toString()),
                (rs, i) -> new WorkingHourResponse(
                        rs.getString("id"),
                        rs.getInt("weekday"),
                        rs.getString("start_hm"),
                        rs.getString("end_hm")));
    }
}
