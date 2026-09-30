package com.inclineyou.inclineyou_backend.core.program;

import com.inclineyou.inclineyou_backend.core.program.dto.Assignment;
import com.inclineyou.inclineyou_backend.core.program.dto.ExerciseRef;
import com.inclineyou.inclineyou_backend.core.program.dto.PatchProgramRequest;
import com.inclineyou.inclineyou_backend.core.program.dto.PlanWorkout;
import com.inclineyou.inclineyou_backend.core.program.dto.PlanWorkout.Exercise;
import com.inclineyou.inclineyou_backend.core.program.dto.PlanWorkout.SetLine;
import com.inclineyou.inclineyou_backend.core.program.dto.ProgramItem;
import com.inclineyou.inclineyou_backend.core.program.dto.ProgramItem.Certified;
import com.inclineyou.inclineyou_backend.core.program.dto.ProgramItem.ClientRef;
import com.inclineyou.inclineyou_backend.core.program.dto.ProgramItem.CopiedFrom;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.*;

/**
 * The SQL on {@code program} and its reads: the shelf and plan summaries, one
 * program's tree, the InclineYou library, who is on a template — and the row
 * writes (create, copy, meta, status, retire) that the tree itself does not
 * need. The tree's own writes are {@link PlanTreeJdbcRepository}.
 *
 * <p>Nothing here loops per program. A page of summaries is one row query plus
 * one grouped count, and a tree is one query per level, keyed on the program.
 */
@Repository
@RequiredArgsConstructor
public class ProgramJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /** The program row locked, with what every write decides on. */
    public record Locked(String clientId, String status, Timestamp revisedAt, String copiedFrom) {
        public String version() {
            return String.valueOf(revisedAt.getTime());
        }
    }

    /** Whom a copy would come from: the trainer's own program or a library one. */
    public record Source(String name, String clientId, String origin) {}

    /** A template's client, for the card: every copy counts, the active ones are sampled. */
    public record AssignedRow(String source, String clientId, String clientName, String status) {}

    /** The trainer's copy of a library program. */
    public record LibraryCopy(String source, String id, long copiedAt, long syncedAt) {}

    public record Tree(List<PlanWorkout> workouts, Map<String, ExerciseRef> dictionary) {}

    /* ─────────────────────────────────────────────────────────────── reads ── */

    public boolean clientOnRoster(UUID trainerId, UUID clientId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM client WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)
                """, Map.of("cid", clientId.toString(), "tid", trainerId.toString()), Boolean.class));
    }

    /**
     * The trainer's templates and plans, no tree. {@code kind} and {@code statuses} are already
     * validated; a null {@code statuses} applies no status filter at all.
     */
    public List<ProgramItem> shelf(UUID trainerId, String kind, UUID clientId, String[] statuses) {
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        var where = new StringBuilder("pr.origin = 'trainer' AND pr.trainer_id = :tid::uuid AND pr.deleted_at IS NULL"
                + " AND (pr.client_id IS NULL OR cl.deleted_at IS NULL)");
        if ("client".equals(kind)) where.append(" AND pr.client_id IS NOT NULL");
        if ("template".equals(kind)) where.append(" AND pr.client_id IS NULL");
        if (clientId != null) {
            p.put("cid", clientId.toString());
            where.append(" AND pr.client_id = :cid::uuid");
        }
        if (statuses != null) {
            p.put("st", statuses);
            where.append(" AND (pr.client_id IS NULL OR pr.status = ANY(CAST(:st AS text[])))");
        }
        return summaries(where.toString(), p, clientId != null
                ? "(pr.status = 'active') DESC, pr.start_date DESC NULLS LAST, pr.created_at DESC, pr.id"
                : "pr.updated_at DESC, pr.id");
    }

    /** The trainer's own program by id — a library id is not one. */
    public Optional<ProgramItem> mine(UUID trainerId, UUID id) {
        return summaries("pr.id = :id::uuid AND pr.origin = 'trainer' AND pr.trainer_id = :tid::uuid"
                + " AND pr.deleted_at IS NULL", new HashMap<>(Map.of("id", id.toString(), "tid", trainerId.toString())),
                "pr.id").stream().findFirst();
    }

    public List<ProgramItem> library() {
        return summaries("pr.origin = 'inclineyou' AND pr.deleted_at IS NULL", new HashMap<>(), "pr.name, pr.id");
    }

    public Optional<ProgramItem> libraryOne(UUID id) {
        return summaries("pr.id = :id::uuid AND pr.origin = 'inclineyou' AND pr.deleted_at IS NULL",
                new HashMap<>(Map.of("id", id.toString())), "pr.id").stream().findFirst();
    }

    /** The row query behind every read. The caller supplies the filter and order, never a value. */
    private List<ProgramItem> summaries(String where, Map<String, Object> params, String order) {
        List<ProgramItem> rows = jdbc.query("""
                SELECT pr.id::text AS id, pr.origin, pr.client_id::text AS client_id, cl.name AS client_name,
                       pr.name, pr.goal, pr.description, pr.weeks, pr.days, pr.status,
                       pr.start_date::text AS start_date, pr.end_date::text AS end_date,
                       pr.copied_from_program_id::text AS copied_from_id, pr.synced_at, pr.revised_at,
                       pr.created_at, pr.updated_at,
                       src.name AS src_name, src.revised_at AS src_revised, (src.revised_at > pr.synced_at) AS behind,
                       cp.summary, cp.level, cp.equipment, cp.reviewed_at, cp.is_sample, cp.used_count
                FROM program pr
                LEFT JOIN client cl ON cl.id = pr.client_id
                LEFT JOIN program src ON src.id = pr.copied_from_program_id
                LEFT JOIN certified_program cp ON cp.program_id = pr.id
                WHERE\s""" + where + " ORDER BY " + order, params, (rs, i) -> {
            long revised = rs.getTimestamp("revised_at").getTime();
            String copiedFromId = rs.getString("copied_from_id");
            return new ProgramItem(rs.getString("id"), rs.getString("origin"), rs.getString("client_id"),
                    rs.getString("client_id") == null ? null
                            : new ClientRef(rs.getString("client_id"), rs.getString("client_name")),
                    rs.getString("name"), rs.getString("goal"), rs.getString("description"),
                    rs.getInt("weeks"), rs.getInt("days"), rs.getString("status"),
                    rs.getString("start_date"), rs.getString("end_date"), copiedFromId,
                    millis(rs.getTimestamp("synced_at")), revised, String.valueOf(revised), 0, 0,
                    copiedFromId == null ? null
                            : new CopiedFrom(copiedFromId, rs.getString("src_name"), rs.getTimestamp("src_revised").getTime()),
                    rs.getBoolean("behind"), 0, 0, List.of(),
                    rs.getTimestamp("created_at").getTime(), rs.getTimestamp("updated_at").getTime(),
                    rs.getString("summary") == null ? null
                            : new Certified(rs.getString("summary"), rs.getString("level"), rs.getString("equipment"),
                            millis(rs.getTimestamp("reviewed_at")), rs.getBoolean("is_sample"), rs.getInt("used_count")),
                    null, null, null, null, null);
        });
        if (rows.isEmpty()) return rows;
        var counts = new HashMap<String, int[]>();
        jdbc.query("""
                SELECT w.program_id::text AS pid, count(DISTINCT w.id) AS workouts,
                       count(we.id) FILTER (WHERE we.alternative_of IS NULL) AS exercises
                FROM workout w LEFT JOIN workout_exercise we ON we.workout_id = w.id
                WHERE w.program_id = ANY(CAST(:ids AS uuid[])) AND w.deleted_at IS NULL
                GROUP BY w.program_id
                """, Map.of("ids", rows.stream().map(ProgramItem::id).toArray(String[]::new)), rs -> {
            counts.put(rs.getString("pid"), new int[]{rs.getInt("workouts"), rs.getInt("exercises")});
        });
        return rows.stream().map(r -> {
            int[] c = counts.getOrDefault(r.id(), new int[]{0, 0});
            return r.withCounts(c[0], c[1]);
        }).toList();
    }

    /** Copies of these templates, by client name — the page's whole assignment picture in one query. */
    public List<AssignedRow> assignedTo(UUID trainerId, String[] templateIds) {
        return jdbc.query("""
                SELECT c.copied_from_program_id::text AS src, c.client_id::text AS client_id, cl.name, c.status
                FROM program c JOIN client cl ON cl.id = c.client_id AND cl.deleted_at IS NULL
                WHERE c.copied_from_program_id = ANY(CAST(:ids AS uuid[])) AND c.trainer_id = :tid::uuid
                  AND c.deleted_at IS NULL
                ORDER BY cl.name, c.id
                """, Map.of("ids", templateIds, "tid", trainerId.toString()),
                (rs, i) -> new AssignedRow(rs.getString("src"), rs.getString("client_id"), rs.getString("name"),
                        rs.getString("status")));
    }

    /** The trainer's newest copy of each of these library programs. */
    public List<LibraryCopy> copiesOf(UUID trainerId, String[] libraryIds) {
        return jdbc.query("""
                SELECT DISTINCT ON (copied_from_program_id) copied_from_program_id::text AS src, id::text AS id,
                       created_at, synced_at
                FROM program
                WHERE trainer_id = :tid::uuid AND origin = 'trainer' AND client_id IS NULL AND deleted_at IS NULL
                  AND copied_from_program_id = ANY(CAST(:ids AS uuid[]))
                ORDER BY copied_from_program_id, created_at DESC
                """, Map.of("tid", trainerId.toString(), "ids", libraryIds),
                (rs, i) -> new LibraryCopy(rs.getString("src"), rs.getString("id"),
                        rs.getTimestamp("created_at").getTime(), rs.getTimestamp("synced_at").getTime()));
    }

    /** Sessions done on each of these plans, by program id. */
    public Map<String, Integer> doneSessions(String[] programIds) {
        var done = new HashMap<String, Integer>();
        jdbc.query("""
                SELECT w.program_id::text AS pid, count(*) AS done FROM scheduled_session s
                JOIN workout w ON w.id = s.workout_id
                WHERE w.program_id = ANY(CAST(:ids AS uuid[])) AND s.status = 'done' AND s.deleted_at IS NULL
                GROUP BY w.program_id
                """, Map.of("ids", programIds), rs -> { done.put(rs.getString("pid"), rs.getInt("done")); });
        return done;
    }

    public boolean templateIsMine(UUID trainerId, UUID id) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM program WHERE id = :id::uuid AND trainer_id = :tid::uuid
                               AND origin = 'trainer' AND client_id IS NULL AND deleted_at IS NULL)
                """, Map.of("id", id.toString(), "tid", trainerId.toString()), Boolean.class));
    }

    public List<Assignment> assignments(UUID trainerId, UUID templateId) {
        return jdbc.query("""
                SELECT c.id::text AS program_id, c.name AS program_name, c.client_id::text AS client_id, cl.name,
                       c.status, c.start_date::text AS start_date, c.end_date::text AS end_date, c.synced_at,
                       c.revised_at, (src.revised_at > c.synced_at) AS behind
                FROM program c
                JOIN client cl ON cl.id = c.client_id AND cl.deleted_at IS NULL
                JOIN program src ON src.id = c.copied_from_program_id
                WHERE c.copied_from_program_id = :id::uuid AND c.trainer_id = :tid::uuid AND c.deleted_at IS NULL
                ORDER BY (c.status = 'active') DESC, cl.name, c.id
                """, Map.of("tid", trainerId.toString(), "id", templateId.toString()),
                (rs, i) -> new Assignment(rs.getString("program_id"), rs.getString("program_name"),
                        rs.getString("client_id"), rs.getString("name"), rs.getString("status"),
                        rs.getString("start_date"), rs.getString("end_date"), millis(rs.getTimestamp("synced_at")),
                        rs.getBoolean("behind"), String.valueOf(rs.getTimestamp("revised_at").getTime())));
    }

    /** One program's four levels — a set-based query each — plus the names of the exercises it uses. */
    public Tree tree(UUID programId) {
        var p = Map.of("id", programId.toString());
        record Wk(String id, String name, String notes, int week, int day, int position) {}
        var workouts = jdbc.query("""
                SELECT id::text, name, notes, week, day, position FROM workout
                WHERE program_id = :id::uuid AND deleted_at IS NULL ORDER BY week, day, position, id
                """, p, (rs, i) -> new Wk(rs.getString(1), rs.getString(2), rs.getString(3), rs.getInt(4), rs.getInt(5),
                rs.getInt(6)));

        var byWorkout = exercisesByWorkout(workouts.stream().map(w -> UUID.fromString(w.id())).toList());
        var used = new LinkedHashSet<String>();
        byWorkout.values().forEach(rows -> rows.forEach(e -> {
            used.add(e.exerciseId());
            e.alternatives().forEach(a -> used.add(a.exerciseId()));
        }));
        var out = new ArrayList<PlanWorkout>();
        for (Wk w : workouts) {
            out.add(new PlanWorkout(w.id(), w.name(), w.notes(), w.week(), w.day(), w.position(),
                    byWorkout.getOrDefault(w.id(), List.of())));
        }
        var dictionary = new LinkedHashMap<String, ExerciseRef>();
        if (!used.isEmpty()) {
            // Deleted exercises are read too: a plan that still prescribes one keeps its name (R83).
            jdbc.query("""
                    SELECT id::text, name, equipment, log_type, muscle_group, body_part, target, movement_pattern, level,
                           (origin = 'trainer') AS custom
                    FROM exercise WHERE id = ANY(CAST(:ids AS uuid[]))
                    """, Map.of("ids", used.toArray(String[]::new)), rs -> {
                dictionary.put(rs.getString(1), new ExerciseRef(rs.getString(2), rs.getString(3), rs.getString(4),
                        rs.getString(5), rs.getString(6), rs.getString(7), rs.getString(8), rs.getString(9),
                        rs.getBoolean(10)));
            });
        }
        return new Tree(out, dictionary);
    }

    /**
     * The exercises of these workouts, each main with its sets and up to two alternatives, keyed by
     * workout id — three set-based queries however many workouts there are. A standalone workout and a
     * program's day are the same rows, so both read through this.
     */
    public Map<String, List<Exercise>> exercisesByWorkout(Collection<UUID> workoutIds) {
        if (workoutIds.isEmpty()) return Map.of();
        var p = Map.of("ids", PlanTreeJdbcRepository.strings(workoutIds));
        record Ex(String id, String workoutId, String exerciseId, int position, String alternativeOf,
                  String groupId, String section, String notes) {}
        var exercises = jdbc.query("""
                SELECT we.id::text, we.workout_id::text, we.exercise_id::text, we.position, we.alternative_of::text,
                       we.group_id::text, we.section, we.notes
                FROM workout_exercise we
                WHERE we.workout_id = ANY(CAST(:ids AS uuid[])) ORDER BY we.workout_id, we.position, we.id
                """, p, (rs, i) -> new Ex(rs.getString(1), rs.getString(2), rs.getString(3), rs.getInt(4),
                rs.getString(5), rs.getString(6), rs.getString(7), rs.getString(8)));

        var sets = new HashMap<String, List<SetLine>>();
        jdbc.query("""
                SELECT s.workout_exercise_id::text AS eid, s.id::text, s.position, s.load_kind, s.load_value,
                       s.effort_kind, s.effort_value, s.rest_seconds, s.tempo, s.notes
                FROM workout_set s JOIN workout_exercise we ON we.id = s.workout_exercise_id
                WHERE we.workout_id = ANY(CAST(:ids AS uuid[])) ORDER BY s.workout_exercise_id, s.position
                """, p, rs -> {
            sets.computeIfAbsent(rs.getString("eid"), k -> new ArrayList<>()).add(new SetLine(
                    rs.getString("id"), rs.getInt("position"), rs.getString("load_kind"), dbl(rs.getBigDecimal("load_value")),
                    rs.getString("effort_kind"), dbl(rs.getBigDecimal("effort_value")),
                    (Integer) rs.getObject("rest_seconds"), rs.getString("tempo"), rs.getString("notes")));
        });

        var alts = new HashMap<String, List<Exercise>>();
        var mains = new LinkedHashMap<String, List<Ex>>();
        for (Ex e : exercises) {
            if (e.alternativeOf() != null) {
                // an alternative carries no `alternatives` key at all (null)
                alts.computeIfAbsent(e.alternativeOf(), k -> new ArrayList<>()).add(new Exercise(e.id(), e.exerciseId(),
                        e.position(), e.groupId(), e.section(), e.notes(), sets.getOrDefault(e.id(), List.of()), null));
            } else {
                mains.computeIfAbsent(e.workoutId(), k -> new ArrayList<>()).add(e);
            }
        }
        var out = new HashMap<String, List<Exercise>>();
        mains.forEach((wid, rows) -> out.put(wid, rows.stream().map(e -> new Exercise(e.id(), e.exerciseId(),
                e.position(), e.groupId(), e.section(), e.notes(), sets.getOrDefault(e.id(), List.of()),
                alts.getOrDefault(e.id(), List.of()))).toList()));
        return out;
    }

    /** Is this id a standalone workout of the trainer's that was already retired — so a repeat delete is a repeat, not a 404. */
    public boolean retiredWorkoutOf(UUID trainerId, UUID workoutId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM workout WHERE id = :id::uuid AND trainer_id = :tid::uuid
                               AND program_id IS NULL AND deleted_at IS NOT NULL)
                """, Map.of("id", workoutId.toString(), "tid", trainerId.toString()), Boolean.class));
    }

    /** {@code revised_at} as epoch ms — the version If-Match carries. */
    public String version(UUID id) {
        Timestamp t = jdbc.queryForObject("SELECT revised_at FROM program WHERE id = :id::uuid",
                Map.of("id", id.toString()), Timestamp.class);
        return String.valueOf(t.getTime());
    }

    /* ────────────────────────────────────────────────────────────── writes ── */

    /** The trainer's program row, locked — a library program and somebody else's are the same absence. */
    public Optional<Locked> lock(UUID trainerId, UUID id) {
        return jdbc.query("""
                SELECT client_id::text AS client_id, status, revised_at, copied_from_program_id::text AS copied_from
                FROM program
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND origin = 'trainer' AND deleted_at IS NULL
                FOR UPDATE
                """, Map.of("id", id.toString(), "tid", trainerId.toString()),
                (rs, i) -> new Locked(rs.getString("client_id"), rs.getString("status"), rs.getTimestamp("revised_at"),
                        rs.getString("copied_from"))).stream().findFirst();
    }

    /** Does this id exist, and is it the trainer's live template? Empty when nothing has it. */
    public Optional<Boolean> templateOwnership(UUID trainerId, UUID id) {
        return jdbc.queryForList("""
                SELECT (trainer_id = :tid::uuid AND client_id IS NULL AND origin = 'trainer' AND deleted_at IS NULL) AS mine
                FROM program WHERE id = :id::uuid
                """, Map.of("id", id.toString(), "tid", trainerId.toString()), Boolean.class).stream().findFirst();
    }

    public void insertTemplate(UUID id, UUID trainerId, String name, String goal, String description, int weeks,
                               int days) {
        jdbc.update("""
                INSERT INTO program (id, origin, trainer_id, name, goal, description, weeks, days)
                VALUES (:id::uuid, 'trainer', :tid::uuid, :name, :goal, :description, :weeks, :days)
                """, new MapSqlParameterSource("id", id.toString()).addValue("tid", trainerId.toString())
                .addValue("name", name).addValue("goal", goal).addValue("description", description)
                .addValue("weeks", weeks).addValue("days", days));
    }

    /** What a copy would start from: the trainer's own program, or a live library one. */
    public Optional<Source> copySource(UUID trainerId, UUID sourceId) {
        return jdbc.query("""
                SELECT name, client_id::text AS client_id, origin FROM program
                WHERE id = :src::uuid AND deleted_at IS NULL AND (trainer_id = :tid::uuid OR origin = 'inclineyou')
                """, Map.of("src", sourceId.toString(), "tid", trainerId.toString()),
                (rs, i) -> new Source(rs.getString("name"), rs.getString("client_id"), rs.getString("origin")))
                .stream().findFirst();
    }

    /** The new template's row. {@code linked} keeps the source as {@code copied_from_program_id}. */
    public void insertCopy(UUID id, UUID trainerId, UUID sourceId, String name, boolean linked) {
        jdbc.update("""
                INSERT INTO program (id, origin, trainer_id, name, goal, description, weeks, days,
                                     copied_from_program_id, synced_at)
                SELECT :id::uuid, 'trainer', :tid::uuid, :name, goal, description, weeks, days,
                       CASE WHEN :linked THEN id END, CASE WHEN :linked THEN now() END
                FROM program WHERE id = :src::uuid
                """, new MapSqlParameterSource("id", id.toString()).addValue("tid", trainerId.toString())
                .addValue("src", sourceId.toString()).addValue("name", name).addValue("linked", linked));
    }

    /**
     * In its own table, so counting a use never moves a program's {@code revised_at}. Through V3's
     * function: catalogue rows are not writable from a request, so a plain UPDATE would match nothing.
     */
    public void countUse(UUID libraryId) {
        jdbc.query("SELECT certified_program_count_use(:id::uuid)", Map.of("id", libraryId.toString()), rs -> { });
    }

    /** A save's shape: bumps the version, which is what makes copies of a template show as behind. */
    public void updateShape(UUID id, String name, String goal, String description, int weeks, int days) {
        jdbc.update("""
                UPDATE program SET name = :name, goal = :goal, description = :description, weeks = :weeks,
                                   days = :days, revised_at = now()
                WHERE id = :id::uuid
                """, new MapSqlParameterSource("id", id.toString()).addValue("name", name).addValue("goal", goal)
                .addValue("description", description).addValue("weeks", weeks).addValue("days", days));
    }

    public Optional<LocalDate[]> dates(UUID id) {
        return jdbc.query("SELECT start_date, end_date FROM program WHERE id = :id::uuid", Map.of("id", id.toString()),
                (rs, i) -> new LocalDate[]{
                        rs.getDate(1) == null ? null : rs.getDate(1).toLocalDate(),
                        rs.getDate(2) == null ? null : rs.getDate(2).toLocalDate()}).stream().findFirst();
    }

    /** A PATCH's non-status fields; any of them bumps the version. Dates arrive already merged with the row's. */
    public void patchFields(UUID id, PatchProgramRequest req, boolean datesTouched, LocalDate start, LocalDate end) {
        var sets = new StringBuilder();
        var p = new MapSqlParameterSource("id", id.toString());
        if (req.name() != null) { sets.append(", name = :name"); p.addValue("name", req.name().value()); }
        if (req.goal() != null) { sets.append(", goal = :goal"); p.addValue("goal", req.goal().value()); }
        if (req.description() != null) {
            sets.append(", description = :description");
            p.addValue("description", req.description().value());
        }
        if (datesTouched) {
            sets.append(", start_date = :start, end_date = :end");
            p.addValue("start", start == null ? null : Date.valueOf(start)).addValue("end", end == null ? null : Date.valueOf(end));
        }
        if (sets.isEmpty()) return;
        jdbc.update("UPDATE program SET revised_at = now()" + sets + " WHERE id = :id::uuid", p);
    }

    /** One active plan per client ({@code uq_program_client_active}): the old one completes first. */
    public void completeOthers(String clientId, UUID except) {
        jdbc.update("""
                UPDATE program SET status = 'completed'
                WHERE client_id = :cid::uuid AND status = 'active' AND deleted_at IS NULL AND id <> :id::uuid
                """, Map.of("cid", clientId, "id", except.toString()));
    }

    public void setStatus(UUID id, String status) {
        jdbc.update("UPDATE program SET status = :status WHERE id = :id::uuid",
                Map.of("status", status, "id", id.toString()));
    }

    /** Whether the trainer has this template (live or retired) and whether it is a client's plan. */
    public Optional<RetireTarget> retireTarget(UUID trainerId, UUID id) {
        return jdbc.query("""
                SELECT client_id IS NOT NULL AS is_plan, deleted_at IS NOT NULL AS gone FROM program
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND origin = 'trainer'
                """, Map.of("id", id.toString(), "tid", trainerId.toString()),
                (rs, i) -> new RetireTarget(rs.getBoolean("is_plan"), rs.getBoolean("gone"))).stream().findFirst();
    }

    public record RetireTarget(boolean clientPlan, boolean alreadyGone) {}

    /** Soft: the copies already made are their own rows and keep pointing here. */
    public void retire(UUID id) {
        var p = Map.of("id", id.toString());
        jdbc.update("UPDATE program SET deleted_at = now() WHERE id = :id::uuid", p);
        jdbc.update("UPDATE workout SET deleted_at = now() WHERE program_id = :id::uuid AND deleted_at IS NULL", p);
    }

    /** The client locked, and their status — empty when they are not on this trainer's roster. */
    public Optional<String> lockClientStatus(UUID trainerId, UUID clientId) {
        return jdbc.queryForList("""
                SELECT status FROM client WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                FOR UPDATE
                """, Map.of("cid", clientId.toString(), "tid", trainerId.toString()), String.class).stream().findFirst();
    }

    /** Does this id exist, and is it this trainer's plan for this client? Empty when nothing has it. */
    public Optional<Boolean> planOwnership(UUID trainerId, UUID id, UUID clientId) {
        return jdbc.queryForList("""
                SELECT (trainer_id = :tid::uuid AND client_id = :cid::uuid) FROM program WHERE id = :id::uuid
                """, Map.of("id", id.toString(), "tid", trainerId.toString(), "cid", clientId.toString()), Boolean.class)
                .stream().findFirst();
    }

    /** The client's plan: a copy of {@code templateId}, active, ending {@code end} or a length of weeks after the start. */
    public void insertPlan(UUID id, UUID trainerId, UUID clientId, UUID templateId, String name, String goal,
                           LocalDate start, LocalDate end) {
        jdbc.update("""
                INSERT INTO program (id, origin, trainer_id, client_id, name, goal, description, weeks, days, status,
                                     start_date, end_date, copied_from_program_id, synced_at)
                SELECT :id::uuid, 'trainer', :tid::uuid, :cid::uuid, coalesce(:name, name), coalesce(:goal, goal),
                       description, weeks, days, 'active', :start,
                       coalesce(CAST(:end AS date), CAST(:start AS date) + (weeks * 7 - 1)), id, now()
                FROM program WHERE id = :src::uuid
                """, new MapSqlParameterSource("id", id.toString()).addValue("tid", trainerId.toString())
                .addValue("cid", clientId.toString()).addValue("src", templateId.toString())
                .addValue("name", name).addValue("goal", goal).addValue("start", Date.valueOf(start))
                .addValue("end", end == null ? null : Date.valueOf(end)));
    }

    /** Ids of the exercises (of these) that exist for this trainer — a deleted custom still counts (R83). */
    public Set<UUID> knownExercises(UUID trainerId, Collection<UUID> ids) {
        var found = new HashSet<UUID>();
        jdbc.query("""
                SELECT id::text FROM exercise
                WHERE id = ANY(CAST(:ids AS uuid[])) AND (origin = 'inclineyou' OR trainer_id = :tid::uuid)
                """, Map.of("ids", PlanTreeJdbcRepository.strings(ids), "tid", trainerId.toString()),
                rs -> { found.add(UUID.fromString(rs.getString(1))); });
        return found;
    }

    /** The client's future, un-started sessions booked against any of these workouts. */
    public List<String> futureSessionsOn(String clientId, Collection<UUID> workoutIds) {
        return jdbc.queryForList("""
                SELECT id::text FROM scheduled_session
                WHERE client_id = :cid::uuid AND workout_id = ANY(CAST(:w AS uuid[])) AND status = 'scheduled'
                  AND started_at IS NULL AND scheduled_at > now() AND deleted_at IS NULL
                """, Map.of("cid", clientId, "w", PlanTreeJdbcRepository.strings(workoutIds)), String.class);
    }

    /** The source a resync reads: its weeks and days, when it is still there to read. */
    public Optional<int[]> resyncSource(UUID trainerId, String sourceId) {
        return jdbc.query("""
                SELECT weeks, days FROM program
                WHERE id = :src::uuid AND deleted_at IS NULL AND (trainer_id = :tid::uuid OR origin = 'inclineyou')
                """, Map.of("src", sourceId, "tid", trainerId.toString()),
                (rs, i) -> new int[]{rs.getInt(1), rs.getInt(2)}).stream().findFirst();
    }

    private static Long millis(Timestamp t) {
        return t == null ? null : t.getTime();
    }

    private static Double dbl(BigDecimal v) {
        return v == null ? null : v.doubleValue();
    }
}
