package com.inclineyou.inclineyou_backend.team;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The shared program library. Phase 2.
 *
 * <h2>Templates are copied, not shared in place</h2>
 *
 * Any active member may read every teammate's templates and copy one into their
 * own book. Copying — rather than assigning from somebody else's row — for one
 * reason: a template two coaches use and one coach edits is a template that
 * changed under the other's clients without either of them touching it.
 *
 * Ordinal day slots (V24) are what make a copy cheap and self-contained. A
 * template carries its own days inside `structure`, so a copy needs nothing from
 * the original and the two never have to agree again.
 *
 * <p>Note the asymmetry with custom exercises, which <em>are</em> shared in
 * place and ride sync: an exercise is a name and a muscle group that means the
 * same thing to everybody, whereas a program is a coach's opinion. Editing a
 * teammate's template in place is the Phase 3 admin capability.
 *
 * <p>This class does not widen anything by itself — `TeamScope` is still the
 * only source of the trainer-id set.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TeamLibraryService {

    private final NamedParameterJdbcTemplate jdbc;
    private final TeamScope scope;

    public record TeamTemplateRow(
            UUID id,
            String name,
            String goal,
            String description,
            UUID coachTrainerId,
            String coachName,
            /** True when it is the caller's own — the list is not filtered, it is labelled. */
            boolean mine,
            /** Day slots in the blueprint, so the shelf can show shape not just a name. */
            int days,
            int exercises,
            /** How many clients in the whole team are on a copy of it. */
            int clientsOnIt,
            long updatedAt
    ) {}

    public record CopyResult(UUID templateId, String name) {}

    /**
     * Every template belonging to an active member of the caller's team,
     * including their own.
     *
     * Their own is included rather than filtered out because the screen is a
     * shelf, not a list of other people's things: a coach browsing for a plan
     * wants to see all of them and be told which are theirs.
     */
    @Transactional(readOnly = true)
    public List<TeamTemplateRow> templates(UUID trainerId) {
        var s = scope.resolve(trainerId);
        s.requireTeam();

        return jdbc.queryForList("""
                SELECT tpl.id::text          AS id,
                       tpl.name              AS name,
                       tpl.goal              AS goal,
                       tpl.description       AS description,
                       tpl.trainer_id::text  AS coach_trainer_id,
                       t.name                AS coach_name,
                       tpl.updated_at        AS updated_at,
                       -- The blueprint is jsonb. Counting the distinct `day`
                       -- values in it is what "how many days a week" means for
                       -- an ordinal-slot template, and doing it here saves the
                       -- shelf parsing a structure it does not otherwise need.
                       COALESCE((
                           SELECT COUNT(DISTINCT (e ->> 'day'))
                           FROM jsonb_array_elements(
                                  CASE WHEN jsonb_typeof(tpl.structure) = 'array'
                                       THEN tpl.structure ELSE '[]'::jsonb END) AS e
                       ), 0) AS days,
                       COALESCE((
                           SELECT COUNT(*)
                           FROM jsonb_array_elements(
                                  CASE WHEN jsonb_typeof(tpl.structure) = 'array'
                                       THEN tpl.structure ELSE '[]'::jsonb END) AS e
                       ), 0) AS exercises,
                       (SELECT COUNT(DISTINCT p.client_id) FROM program p
                        WHERE p.template_id = tpl.id
                          AND p.deleted_at IS NULL
                          AND p.status = 'active') AS clients_on_it
                FROM template tpl
                JOIN trainer t ON t.id = tpl.trainer_id
                WHERE tpl.trainer_id = ANY (CAST(:visible AS uuid[]))
                  AND tpl.deleted_at IS NULL
                ORDER BY (tpl.trainer_id = :tid::uuid) DESC, t.name, tpl.name
                """, Map.of(
                "tid", trainerId.toString(),
                "visible", teamTrainerIdArray(s)))
                .stream()
                .map(r -> new TeamTemplateRow(
                        UUID.fromString((String) r.get("id")),
                        (String) r.get("name"),
                        (String) r.get("goal"),
                        (String) r.get("description"),
                        UUID.fromString((String) r.get("coach_trainer_id")),
                        (String) r.get("coach_name"),
                        trainerId.toString().equals(r.get("coach_trainer_id")),
                        ((Number) r.get("days")).intValue(),
                        ((Number) r.get("exercises")).intValue(),
                        ((Number) r.get("clients_on_it")).intValue(),
                        ((Timestamp) r.get("updated_at")).toInstant().toEpochMilli()))
                .toList();
    }

    /**
     * Copy a teammate's template into the caller's own book.
     *
     * One INSERT with a fresh id: a template is a single row whose days and
     * exercises live in `structure`, so there are no children to clone and
     * nothing can be half-copied. The name is suffixed rather than duplicated
     * outright — a shelf with two identical names is a shelf where the trainer
     * picks the wrong one.
     */
    @Transactional
    public CopyResult copy(UUID trainerId, UUID templateId) {
        var s = scope.resolve(trainerId);
        s.requireTeam();

        var rows = jdbc.queryForList("""
                SELECT tpl.name AS name, tpl.goal AS goal, tpl.description AS description,
                       tpl.structure::text AS structure, tpl.day_labels::text AS day_labels
                FROM template tpl
                WHERE tpl.id = :id::uuid
                  AND tpl.trainer_id = ANY (CAST(:visible AS uuid[]))
                  AND tpl.deleted_at IS NULL
                """, Map.of("id", templateId.toString(), "visible", teamTrainerIdArray(s)));

        // Outside the team is a 404, like every other out-of-scope id here.
        if (rows.isEmpty()) throw TeamRuleException.templateNotInTeam();
        var source = rows.getFirst();

        String name = copyName((String) source.get("name"));
        UUID id = UUID.randomUUID();
        Timestamp now = Timestamp.from(Instant.now());

        var p = new java.util.HashMap<String, Object>();
        p.put("id", id.toString());
        p.put("tid", trainerId.toString());
        p.put("name", name);
        p.put("goal", source.get("goal"));
        p.put("description", source.get("description"));
        p.put("structure", source.get("structure"));
        p.put("dayLabels", source.get("day_labels"));
        p.put("now", now);

        jdbc.update("""
                INSERT INTO template (id, trainer_id, name, goal, description,
                                      structure, day_labels, created_at, updated_at)
                VALUES (:id::uuid, :tid::uuid, :name, :goal, :description,
                        CAST(:structure AS jsonb), CAST(:dayLabels AS jsonb), :now, :now)
                """, p);

        log.info("team template {} copied to trainer={} as {}", templateId, trainerId, id);
        return new CopyResult(id, name);
    }

    /**
     * Active members of the caller's team, or just themselves.
     *
     * Note this is NOT `visibleTrainerIds` — the library is the one team-wide
     * read a plain coach gets, so it must widen for a coach as well as for an
     * admin. `TeamScope` deliberately does not widen a coach's *client* scope,
     * and conflating the two would either leak clients to coaches or hide the
     * library from them.
     */
    private String teamTrainerIdArray(TeamScope.Scope s) {
        var ids = jdbc.queryForList("""
                SELECT trainer_id::text AS id FROM team_member
                WHERE team_id = :teamId::uuid
                  AND status = 'active'
                  AND deleted_at IS NULL
                  AND trainer_id IS NOT NULL
                """, Map.of("teamId", s.teamId().toString()))
                .stream().map(r -> (String) r.get("id")).toList();
        // A Postgres array literal, for the same reason `visibleTrainerIdArray`
        // is one — see the note there.
        return ids.stream().collect(java.util.stream.Collectors.joining(",", "{", "}"));
    }

    /** "Push Pull Legs" → "Push Pull Legs (copy)", and truncated to the column. */
    private static String copyName(String original) {
        String base = original == null || original.isBlank() ? "Program" : original;
        String suffixed = base + " (copy)";
        return suffixed.length() <= 150 ? suffixed : suffixed.substring(0, 150);
    }
}
