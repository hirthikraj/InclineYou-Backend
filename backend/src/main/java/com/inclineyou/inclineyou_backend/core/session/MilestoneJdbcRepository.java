package com.inclineyou.inclineyou_backend.core.session;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Map;
import java.util.UUID;

/** The count a session milestone is reached on, and the trainer side's write of one. See {@link SessionMilestones}. */
@Repository
@RequiredArgsConstructor
public class MilestoneJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /**
     * Sessions of either kind finished: every trainer session marked done, and a client's own self-run once a set in it is done (an
     * abandoned start is not a session, R106). The one just closed is counted, inside the caller's transaction.
     */
    public int doneCount(UUID client) {
        return jdbc.queryForObject("SELECT count(*) FROM scheduled_session WHERE client_id = :c::uuid AND status = 'done' AND deleted_at IS NULL "
                + "AND (logged_by = 'trainer' OR EXISTS (SELECT 1 FROM session_exercise se JOIN set_log sl ON sl.session_exercise_id = se.id "
                + "WHERE se.session_id = scheduled_session.id AND sl.done_at IS NOT NULL))", Map.of("c", client.toString()), Integer.class);
    }

    /**
     * The milestone a trainer's Mark done reached, stored once ({@code uq_milestone_once}). Written in the client's own workspace and only
     * when that is the trainer's active one: the staff policy on {@code milestone} accepts no other, and a refused insert would abort the
     * Mark done it rides on. (A v1 trainer has one workspace, so this is the normal case, not an exception.)
     */
    public void record(UUID client, SessionMilestones.Reached m) {
        jdbc.update("""
                INSERT INTO milestone (tenant_id, client_id, kind, label, value)
                SELECT c.tenant_id, c.id, :k, :l, :v FROM client c
                 WHERE c.id = :c::uuid
                   AND (current_setting('app.actor', true) IS DISTINCT FROM 'staff' OR c.tenant_id::text = current_setting('app.tenant_id', true))
                ON CONFLICT (client_id, kind, value) DO NOTHING""",
                Map.of("c", client.toString(), "k", m.kind(), "l", m.label(), "v", m.value()));
    }
}
