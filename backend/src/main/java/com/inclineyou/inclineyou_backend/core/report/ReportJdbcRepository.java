package com.inclineyou.inclineyou_backend.core.report;

import com.inclineyou.inclineyou_backend.core.report.dto.ClientNames;
import com.inclineyou.inclineyou_backend.core.report.dto.NextSession;
import com.inclineyou.inclineyou_backend.core.report.dto.PersonalRecord;
import com.inclineyou.inclineyou_backend.core.report.dto.SessionStats;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * The reads behind {@code GET /v1/clients/{id}/report}. Every statement is scoped by
 * {@code trainer_id}, so a client that is not the caller's reads as absent — a 404-shaped answer,
 * never somebody else's numbers. What the figures MEAN (adherence, the window, the wording) is
 * {@link ReportService}'s.
 */
@Repository
@RequiredArgsConstructor
public class ReportJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /** The client's and the trainer's names; empty when the client is not this trainer's or is deleted. */
    public Optional<ClientNames> names(UUID trainerId, UUID clientId) {
        var p = Map.of("cid", clientId.toString(), "tid", trainerId.toString());
        try {
            Map<String, Object> info = jdbc.queryForMap("""
                    SELECT c.name AS client_name, t.name AS trainer_name
                    FROM client c JOIN trainer t ON t.id = c.trainer_id
                    WHERE c.id = :cid::uuid AND c.trainer_id = :tid::uuid AND c.deleted_at IS NULL
                    """, p);
            return Optional.of(new ClientNames(
                    info.get("client_name") != null ? info.get("client_name").toString() : null,
                    info.get("trainer_name") != null ? info.get("trainer_name").toString() : null));
        } catch (EmptyResultDataAccessException e) {
            return Optional.empty();
        }
    }

    /** Sessions kept and planned since {@code since} (a date: the comparison is against {@code scheduled_at}). */
    public SessionStats sessionStats(UUID trainerId, UUID clientId, LocalDate since) {
        var sessionStats = jdbc.queryForMap("""
                SELECT
                  COUNT(*) FILTER (WHERE status = 'done')       AS done_count,
                  COUNT(*) FILTER (WHERE status != 'cancelled') AS scheduled_count
                FROM scheduled_session
                WHERE client_id = :cid::uuid AND trainer_id = :tid::uuid
                  AND deleted_at IS NULL AND scheduled_at >= :since
                """, Map.of("cid", clientId.toString(), "tid", trainerId.toString(),
                "since", java.sql.Date.valueOf(since)));
        return new SessionStats(toLong(sessionStats.get("done_count")), toLong(sessionStats.get("scheduled_count")));
    }

    /**
     * The five heaviest sets, one per exercise, heaviest first: the top done weight × reps set the client has
     * logged on each movement. The history is the CLIENT's (not who ran each session), and the client has to be
     * this trainer's. Only {@code weight} × {@code reps} sets have a load and a rep count to print; a bodyweight or
     * timed set has no kilogram figure and so no record here.
     */
    public List<PersonalRecord> personalRecords(UUID trainerId, UUID clientId) {
        List<Map<String, Object>> prs = jdbc.queryForList("""
                SELECT ex.name AS ex_name, sub.max_load_kg, sub.max_reps
                FROM (
                    SELECT DISTINCT ON (se.exercise_id)
                        se.exercise_id,
                        sl.load_value   AS max_load_kg,
                        sl.effort_value AS max_reps
                    FROM set_log sl
                    JOIN session_exercise se ON se.id = sl.session_exercise_id
                    JOIN scheduled_session s ON s.id = se.session_id
                    JOIN client c ON c.id = se.client_id
                    WHERE c.id = :cid::uuid AND c.trainer_id = :tid::uuid AND c.deleted_at IS NULL
                      AND se.removed_at IS NULL AND s.deleted_at IS NULL
                      AND sl.done_at IS NOT NULL
                      AND sl.load_kind = 'weight' AND sl.effort_kind = 'reps' AND sl.load_value > 0
                    ORDER BY se.exercise_id, sl.load_value DESC, sl.effort_value DESC NULLS LAST
                ) sub
                JOIN exercise ex ON ex.id = sub.exercise_id
                ORDER BY sub.max_load_kg DESC
                LIMIT 5
                """, Map.of("cid", clientId.toString(), "tid", trainerId.toString()));
        return prs.stream()
                .map(pr -> new PersonalRecord(pr.get("ex_name"), pr.get("max_load_kg"), pr.get("max_reps")))
                .toList();
    }

    /** The next session still to come, if there is one, with the name of the workout it runs (null for a walk-in). */
    public Optional<NextSession> nextSession(UUID trainerId, UUID clientId) {
        try {
            var ns = jdbc.queryForMap("""
                    SELECT s.scheduled_at, w.name AS workout_name
                    FROM scheduled_session s LEFT JOIN workout w ON w.id = s.workout_id
                    WHERE s.client_id = :cid::uuid AND s.trainer_id = :tid::uuid
                      AND s.status = 'scheduled' AND s.deleted_at IS NULL AND s.scheduled_at > NOW()
                    ORDER BY s.scheduled_at ASC LIMIT 1
                    """, Map.of("cid", clientId.toString(), "tid", trainerId.toString()));
            var ts = (java.sql.Timestamp) ns.get("scheduled_at");
            return Optional.of(new NextSession(ts.toInstant(), ns.get("workout_name")));
        } catch (EmptyResultDataAccessException ignored) {
            return Optional.empty();
        }
    }

    private static long toLong(Object o) {
        if (o instanceof Long l) return l;
        if (o instanceof Number n) return n.longValue();
        return 0;
    }
}
