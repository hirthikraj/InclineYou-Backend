package com.inclineyou.inclineyou_backend.core.trainer;

import com.inclineyou.inclineyou_backend.core.trainer.dto.WorkingHourResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The trainer module's hand-written SQL. The {@code trainer} and
 * {@code trainer_business} rows themselves are JPA ({@link TrainerRepository},
 * {@link TrainerBusinessRepository}); this is the read that is not.
 */
@Repository
@RequiredArgsConstructor
public class TrainerJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /**
     * Every working window, in the order a week is read. A split shift is two
     * rows on one weekday — that is the point of the table.
     */
    public List<WorkingHourResponse> workingHours(UUID trainerId) {
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

    /**
     * The profile's version: the later of the two rows' {@code updated_at}, as epoch ms.
     * It is also the ETag. Read AFTER a write has been flushed — the database's
     * {@code set_updated_at} trigger stamps {@code trainer_business}, and the entity in memory
     * has never seen that value.
     */
    public long profileVersion(UUID trainerId) {
        Long v = jdbc.queryForObject("""
                SELECT (extract(epoch FROM greatest(t.updated_at, b.updated_at)) * 1000)::bigint
                FROM trainer t JOIN trainer_business b ON b.trainer_id = t.id
                WHERE t.id = :tid::uuid
                """, Map.of("tid", trainerId.toString()), Long.class);
        return v == null ? 0L : v;
    }

    /** Soft-deletes every live window on these weekdays — the first half of replacing a day. */
    public void softDeleteDays(UUID trainerId, java.util.Collection<Integer> weekdays) {
        if (weekdays.isEmpty()) return;
        jdbc.update("""
                UPDATE working_hours SET deleted_at = now()
                WHERE trainer_id = :tid::uuid AND weekday IN (:days) AND deleted_at IS NULL
                """, Map.of("tid", trainerId.toString(), "days", weekdays));
    }

    /** One window; {@code start}/{@code end} are {@code HH:mm} wall-clock times. */
    public void insertWindow(UUID trainerId, int weekday, String start, String end) {
        jdbc.update("""
                INSERT INTO working_hours (trainer_id, weekday, start_time, end_time)
                VALUES (:tid::uuid, :day, CAST(:start AS time), CAST(:end AS time))
                """, Map.of("tid", trainerId.toString(), "day", weekday, "start", start, "end", end));
    }
}
