package com.xrep.xrep_backend.team;

import com.xrep.xrep_backend.config.AppProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * The one place that answers "whose rows may this caller read".
 *
 * <p>A team is a visibility grant, never a change of owner. Every row in this
 * schema keeps its {@code trainer_id} and eighteen tables keep filtering on it;
 * what team coaching adds is this resolver, which widens the SET of trainer ids
 * an owner or admin may read from {@code {me}} to {@code {me + my team}}.
 *
 * <p>Every team-wide query takes its trainer-id set from here and from nowhere
 * else. That is the point of the class: one place to audit, and one place to get
 * it wrong. A query that assembles its own list of teammates is a query that
 * will still be doing it the old way after the rules change.
 *
 * <h2>A coach is not widened</h2>
 *
 * {@code visibleTrainerIds} is {@code {me}} for a plain coach, and for a trainer
 * with no team at all. Being in a team does not by itself let you read your
 * colleagues' clients — only {@code owner} and {@code admin} get that, and even
 * they never get the money book (see {@code XRep_team_coaching_prd.md} §0.4).
 *
 * <h2>With the feature switched off</h2>
 *
 * {@code app.team.enabled=false} makes this resolve to the solo scope for
 * everybody, which is exactly the right answer for a read that widens: with the
 * feature off nothing widens, and no caller can see anything they could not see
 * before V26 shipped. It is deliberately <em>not</em> where the 404 lives — the
 * controller refuses the endpoints. Two mechanisms, because they answer two
 * different questions.
 */
@Component
@RequiredArgsConstructor
public class TeamScope {

    private final NamedParameterJdbcTemplate jdbc;
    private final AppProperties props;

    /**
     * @param teamId            null when the caller is in no team
     * @param teamRole          null when the caller is in no team
     * @param memberId          the caller's own {@code team_member} row, for the
     *                          endpoints that act on it
     * @param visibleTrainerIds always contains {@code trainerId}, and never
     *                          fewer — a resolver that could return an empty set
     *                          would turn a bug into "you have no clients"
     */
    public record Scope(
            UUID trainerId,
            UUID teamId,
            String teamRole,
            UUID memberId,
            Set<UUID> visibleTrainerIds
    ) {
        public boolean inTeam() { return teamId != null; }

        public boolean administers() { return TeamRole.administers(teamRole); }

        public boolean owns() { return TeamRole.OWNER.equals(teamRole); }

        /** @return the team id, having established there is one. */
        public UUID requireTeam() {
            if (!inTeam()) throw TeamRuleException.noTeam();
            return teamId;
        }

        public UUID requireAdmin() {
            UUID id = requireTeam();
            if (!administers()) throw TeamRuleException.notAdmin();
            return id;
        }

        public UUID requireOwner() {
            UUID id = requireTeam();
            if (!owns()) throw TeamRuleException.notOwner();
            return id;
        }

        /**
         * The same set as {@link #visibleTrainerIds()}, as a Postgres array
         * literal for {@code = ANY (CAST(:visible AS uuid[]))}.
         *
         * Not a bound {@code IN (:list)} of strings, and the reason is both
         * correctness and speed. A list of strings compared against a
         * {@code uuid} column is a type error Postgres refuses outright, and the
         * usual fix — {@code trainer_id::text IN (…)} — casts the column and
         * throws away `idx_client_trainer_id` on a table that holds every
         * trainer's roster. An array literal keeps the comparison in uuid and
         * keeps the index.
         *
         * Exposed here rather than built by each caller so that the set still
         * comes from exactly one place, which is the whole point of this class.
         */
        public String visibleTrainerIdArray() {
            return visibleTrainerIds.stream()
                    .map(UUID::toString)
                    .collect(java.util.stream.Collectors.joining(",", "{", "}"));
        }
    }

    public Scope resolve(UUID trainerId) {
        if (!props.getTeam().isEnabled()) return solo(trainerId);

        var rows = jdbc.queryForList("""
                SELECT id::text AS member_id, team_id::text AS team_id, role
                FROM team_member
                WHERE trainer_id = :tid::uuid
                  AND status = 'active'
                  AND deleted_at IS NULL
                LIMIT 1
                """, Map.of("tid", trainerId.toString()));

        if (rows.isEmpty()) return solo(trainerId);

        var row = rows.getFirst();
        UUID teamId = UUID.fromString((String) row.get("team_id"));
        UUID memberId = UUID.fromString((String) row.get("member_id"));
        String role = (String) row.get("role");

        // A coach sees their own book and no more, so there is nothing to widen
        // and no reason to spend a second query finding that out.
        if (!TeamRole.administers(role)) {
            return new Scope(trainerId, teamId, role, memberId, Set.of(trainerId));
        }

        var visible = new LinkedHashSet<UUID>();
        // Self first, and unconditionally. An admin whose own membership row is
        // mid-edit must not lose sight of their own clients.
        visible.add(trainerId);
        for (var member : jdbc.queryForList("""
                SELECT trainer_id::text AS trainer_id
                FROM team_member
                WHERE team_id = :teamId::uuid
                  AND status = 'active'
                  AND deleted_at IS NULL
                  AND trainer_id IS NOT NULL
                """, Map.of("teamId", teamId.toString()))) {
            visible.add(UUID.fromString((String) member.get("trainer_id")));
        }

        return new Scope(trainerId, teamId, role, memberId, Set.copyOf(visible));
    }

    private static Scope solo(UUID trainerId) {
        return new Scope(trainerId, null, null, null, Set.of(trainerId));
    }
}
