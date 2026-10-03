package com.inclineyou.inclineyou_backend.core.nudge;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * All SQL for {@code nudge_template}: one row per (trainer, template), present only for a template
 * the trainer has reworded. The v1 table has no {@code deleted_at} — a reset is a real DELETE, which
 * is also what puts the trainer back on the live default rather than on a copy of it.
 */
@Repository
@RequiredArgsConstructor
public class NudgeTemplateJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /** A saved override: the wording and its version ({@code updated_at}, epoch ms). */
    public record Override(String body, long version) {}

    /**
     * Every override this trainer has, by template name. Read whole rather than one at a time:
     * there are at most eight rows, and {@link NudgeService} needs one of them per send.
     */
    public Map<String, Override> overrides(UUID trainerId) {
        Map<String, Override> out = new HashMap<>();
        jdbc.query("""
                SELECT template, body, (extract(epoch FROM updated_at) * 1000)::bigint AS version
                FROM nudge_template WHERE trainer_id = :tid::uuid
                """, Map.of("tid", trainerId.toString()),
                rs -> { out.put(rs.getString("template"), new Override(rs.getString("body"), rs.getLong("version"))); });
        return out;
    }

    /** Insert or reword; answers the new version. */
    public long upsert(UUID trainerId, String template, String body) {
        Long version = jdbc.queryForObject("""
                INSERT INTO nudge_template (trainer_id, template, body)
                VALUES (:tid::uuid, :t, :body)
                ON CONFLICT (trainer_id, template)
                DO UPDATE SET body = EXCLUDED.body, updated_at = now()
                RETURNING (extract(epoch FROM updated_at) * 1000)::bigint
                """, Map.of("tid", trainerId.toString(), "t", template, "body", body), Long.class);
        return version == null ? 0L : version;
    }

    /** Back to the built-in wording; a no-op when there was no override. */
    public void delete(UUID trainerId, String template) {
        jdbc.update("DELETE FROM nudge_template WHERE trainer_id = :tid::uuid AND template = :t",
                Map.of("tid", trainerId.toString(), "t", template));
    }
}
