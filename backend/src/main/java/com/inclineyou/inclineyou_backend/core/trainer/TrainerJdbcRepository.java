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
}
