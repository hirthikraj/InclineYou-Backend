package com.inclineyou.inclineyou_backend.core.program;

import com.inclineyou.inclineyou_backend.core.program.PlanRules.E;
import com.inclineyou.inclineyou_backend.core.program.PlanRules.S;
import com.inclineyou.inclineyou_backend.core.program.PlanRules.W;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.stereotype.Repository;

import java.util.*;

/**
 * The SQL that writes the four-level plan tree. Two operations, both inside the caller's
 * transaction: {@link #copy} (a deep copy, one statement) and {@link #save} (the
 * builder's whole-tree PUT, diffed by id).
 *
 * <p><b>Why a save is a diff and not delete-and-reinsert.</b>
 * {@code scheduled_session.workout_id} points at workouts, so a workout keeps its
 * id across saves — rows with an id are updated in place, rows without one are
 * inserted, rows left out are removed (a workout is soft-deleted; its exercises
 * stay with it, unreachable). Exercises and sets are different: nothing points
 * at a set, and only an in-progress log points at an exercise
 * ({@code session_exercise.planned_from}, ON DELETE SET NULL), so below the
 * workout the diff is cheaper to state as "main exercises upsert by id,
 * alternatives and sets are rewritten".
 *
 * <p><b>The +1000 shuffle.</b> {@code uq_workout_slot} and
 * {@code uq_workout_exercise_order} are plain unique indexes, checked per row. A
 * save that swaps two days, or drags an exercise above its neighbour, would
 * collide mid-statement. Retained rows are parked at {@code position + 1000}
 * first and then written to their real place, so the order of the statements
 * inside the batch stops mattering.
 */
@Repository
@RequiredArgsConstructor
public class PlanTreeJdbcRepository {

    private static final int PARK = 1000;

    private final NamedParameterJdbcTemplate jdbc;

    /** Deep-copy {@code src}'s live tree into {@code dst} (already inserted), ids re-minted. */
    public void copy(UUID src, UUID dst, UUID trainerId) {
        var p = Map.of("src", src.toString(), "id", dst.toString(), "tid", trainerId.toString());
        // Volatile ids in a CTE are materialised once, so every reference to e.new is the same id;
        // the FKs are checked at the end of the statement.
        jdbc.update("""
                WITH w AS (
                    SELECT id AS old, gen_random_uuid() AS new, week, day, position, name, notes
                    FROM workout WHERE program_id = :src::uuid AND deleted_at IS NULL
                ),
                wi AS (
                    INSERT INTO workout (id, origin, trainer_id, program_id, week, day, position, name, notes, copied_from_workout_id)
                    SELECT w.new, 'trainer', :tid::uuid, :id::uuid, w.week, w.day, w.position, w.name, w.notes, w.old FROM w
                ),
                e AS (
                    SELECT we.id AS old, gen_random_uuid() AS new, we.workout_id, we.exercise_id, we.position,
                           we.alternative_of, we.group_id, we.section, we.notes
                    FROM workout_exercise we JOIN w ON w.old = we.workout_id
                ),
                ei AS (
                    INSERT INTO workout_exercise (id, workout_id, exercise_id, position, alternative_of, group_id, section, notes)
                    SELECT e.new, w.new, e.exercise_id, e.position, alt.new, e.group_id, e.section, e.notes
                    FROM e JOIN w ON w.old = e.workout_id LEFT JOIN e alt ON alt.old = e.alternative_of
                )
                INSERT INTO workout_set (workout_exercise_id, position, load_kind, load_value, effort_kind, effort_value,
                                         rest_seconds, tempo, notes)
                SELECT e.new, s.position, s.load_kind, s.load_value, s.effort_kind, s.effort_value, s.rest_seconds,
                       s.tempo, s.notes
                FROM workout_set s JOIN e ON e.old = s.workout_exercise_id
                """, p);
    }

    /**
     * Write {@code tree} as program {@code programId}'s tree. Returns the ids of the
     * workouts this save removed, so the caller can re-point the sessions that
     * were booked against them.
     */
    public Set<UUID> save(UUID programId, UUID trainerId, List<W> tree) {
        String pid = programId.toString();
        var p = new MapSqlParameterSource("pid", pid).addValue("tid", trainerId.toString());

        Set<UUID> existing = new HashSet<>();
        jdbc.query("SELECT id::text FROM workout WHERE program_id = :pid::uuid AND deleted_at IS NULL", p,
                rs -> { existing.add(UUID.fromString(rs.getString(1))); });
        Set<UUID> kept = new HashSet<>();
        tree.forEach(w -> kept.add(w.id()));
        Set<UUID> removed = new HashSet<>(existing);
        removed.removeAll(kept);

        if (!removed.isEmpty()) {
            jdbc.update("UPDATE workout SET deleted_at = now() WHERE program_id = :pid::uuid AND id = ANY(CAST(:ids AS uuid[]))",
                    new MapSqlParameterSource("pid", pid).addValue("ids", strings(removed)));
        }
        jdbc.update("UPDATE workout SET position = position + " + PARK
                + " WHERE program_id = :pid::uuid AND deleted_at IS NULL", p);

        // workouts: upsert. A row that exists under another program matches the conflict target but
        // not the WHERE, so it updates nothing — and that zero is the ID_CONFLICT.
        int[] wrote = jdbc.batchUpdate("""
                INSERT INTO workout (id, origin, trainer_id, program_id, week, day, position, name, notes)
                VALUES (:id::uuid, 'trainer', :tid::uuid, :pid::uuid, :week, :day, :position, :name, :notes)
                ON CONFLICT (id) DO UPDATE SET week = EXCLUDED.week, day = EXCLUDED.day, position = EXCLUDED.position,
                    name = EXCLUDED.name, notes = EXCLUDED.notes, deleted_at = NULL
                WHERE workout.program_id = EXCLUDED.program_id
                """, tree.stream().map(w -> new MapSqlParameterSource()
                .addValue("id", w.id().toString()).addValue("tid", trainerId.toString()).addValue("pid", pid)
                .addValue("week", w.week()).addValue("day", w.day()).addValue("position", w.position())
                .addValue("name", w.name()).addValue("notes", w.notes())).toArray(SqlParameterSource[]::new));
        for (int n : wrote) if (n == 0) throw ApiException.idConflict();

        // exercises
        var mains = new ArrayList<Object[]>(); // {workout, E}
        var alts = new ArrayList<Object[]>();  // {workout, main E, alt E}
        tree.forEach(w -> w.exercises().forEach(e -> {
            mains.add(new Object[]{w, e});
            e.alternatives().forEach(a -> alts.add(new Object[]{w, e, a}));
        }));
        String[] mainIds = mains.stream().map(m -> ((E) m[1]).id().toString()).toArray(String[]::new);

        jdbc.update("""
                DELETE FROM workout_exercise WHERE alternative_of IS NOT NULL AND workout_id IN
                    (SELECT id FROM workout WHERE program_id = :pid::uuid AND deleted_at IS NULL)
                """, p);
        jdbc.update("""
                DELETE FROM workout_exercise WHERE alternative_of IS NULL AND NOT (id = ANY(CAST(:ids AS uuid[]))) AND workout_id IN
                    (SELECT id FROM workout WHERE program_id = :pid::uuid AND deleted_at IS NULL)
                """, new MapSqlParameterSource("pid", pid).addValue("ids", mainIds));
        jdbc.update("UPDATE workout_exercise SET position = position + " + PARK + """
                 WHERE alternative_of IS NULL AND workout_id IN
                    (SELECT id FROM workout WHERE program_id = :pid::uuid AND deleted_at IS NULL)
                """, p);
        int[] mainsWrote = jdbc.batchUpdate("""
                INSERT INTO workout_exercise (id, workout_id, exercise_id, position, group_id, section, notes)
                VALUES (:id::uuid, :wid::uuid, :exid::uuid, :position, :gid::uuid, :section, :notes)
                ON CONFLICT (id) DO UPDATE SET workout_id = EXCLUDED.workout_id, exercise_id = EXCLUDED.exercise_id,
                    position = EXCLUDED.position, group_id = EXCLUDED.group_id, section = EXCLUDED.section,
                    notes = EXCLUDED.notes
                WHERE workout_exercise.workout_id IN (SELECT id FROM workout WHERE program_id = :pid::uuid)
                """, mains.stream().map(m -> {
            var e = (E) m[1];
            return new MapSqlParameterSource().addValue("id", e.id().toString())
                    .addValue("wid", ((W) m[0]).id().toString()).addValue("exid", e.exerciseId().toString())
                    .addValue("position", e.position()).addValue("gid", str(e.groupId()))
                    .addValue("section", e.section()).addValue("notes", e.notes()).addValue("pid", pid);
        }).toArray(SqlParameterSource[]::new));
        for (int n : mainsWrote) if (n == 0) throw ApiException.idConflict();

        if (!alts.isEmpty()) {
            jdbc.batchUpdate("""
                    INSERT INTO workout_exercise (id, workout_id, exercise_id, position, alternative_of, notes)
                    VALUES (:id::uuid, :wid::uuid, :exid::uuid, :position, :main::uuid, :notes)
                    """, alts.stream().map(a -> {
                var alt = (E) a[2];
                return new MapSqlParameterSource().addValue("id", alt.id().toString())
                        .addValue("wid", ((W) a[0]).id().toString()).addValue("exid", alt.exerciseId().toString())
                        .addValue("position", alt.position()).addValue("main", ((E) a[1]).id().toString())
                        .addValue("notes", alt.notes());
            }).toArray(SqlParameterSource[]::new));
        }

        // sets: nothing references one, so rewrite every set of every exercise in the save
        var owners = new ArrayList<E>();
        mains.forEach(m -> owners.add((E) m[1]));
        alts.forEach(a -> owners.add((E) a[2]));
        jdbc.update("DELETE FROM workout_set WHERE workout_exercise_id = ANY(CAST(:ids AS uuid[]))",
                new MapSqlParameterSource("ids", owners.stream().map(e -> e.id().toString()).toArray(String[]::new)));
        var setRows = new ArrayList<SqlParameterSource>();
        for (E e : owners) {
            for (S s : e.sets()) {
                setRows.add(new MapSqlParameterSource().addValue("id", s.id().toString())
                        .addValue("eid", e.id().toString()).addValue("position", s.position())
                        .addValue("lk", s.loadKind()).addValue("lv", s.load()).addValue("ek", s.effortKind())
                        .addValue("ev", s.effort()).addValue("rest", s.rest()).addValue("tempo", s.tempo())
                        .addValue("notes", s.notes()));
            }
        }
        if (!setRows.isEmpty()) {
            jdbc.batchUpdate("""
                    INSERT INTO workout_set (id, workout_exercise_id, position, load_kind, load_value, effort_kind,
                                             effort_value, rest_seconds, tempo, notes)
                    VALUES (:id::uuid, :eid::uuid, :position, :lk, :lv, :ek, :ev, :rest, :tempo, :notes)
                    """, setRows.toArray(SqlParameterSource[]::new));
        }
        return removed;
    }

    /**
     * Replace every exercise under one workout — alternatives and sets go with them (ON DELETE CASCADE)
     * — and write {@code rows} with {@code sections} (a divider's label) folded onto the main at that
     * position. A standalone workout's save: nothing below the workout keeps an id across it.
     */
    public void replaceExercises(UUID workoutId, List<E> rows, Map<Integer, String> sections) {
        String wid = workoutId.toString();
        jdbc.update("DELETE FROM workout_exercise WHERE workout_id = :wid::uuid", Map.of("wid", wid));
        jdbc.batchUpdate("""
                INSERT INTO workout_exercise (id, workout_id, exercise_id, position, group_id, section, notes)
                VALUES (:id::uuid, :wid::uuid, :exid::uuid, :position, :gid::uuid, :section, :notes)
                """, rows.stream().map(e -> new MapSqlParameterSource().addValue("id", e.id().toString())
                .addValue("wid", wid).addValue("exid", e.exerciseId().toString()).addValue("position", e.position())
                .addValue("gid", str(e.groupId())).addValue("section", sections.get(e.position()))
                .addValue("notes", e.notes())).toArray(SqlParameterSource[]::new));
        var alts = new ArrayList<SqlParameterSource>();
        var setRows = new ArrayList<SqlParameterSource>();
        for (E e : rows) {
            var owners = new ArrayList<E>();
            owners.add(e);
            for (E a : e.alternatives()) {
                owners.add(a);
                alts.add(new MapSqlParameterSource().addValue("id", a.id().toString()).addValue("wid", wid)
                        .addValue("exid", a.exerciseId().toString()).addValue("position", a.position())
                        .addValue("main", e.id().toString()).addValue("notes", a.notes()));
            }
            for (E owner : owners) {
                for (S s : owner.sets()) {
                    setRows.add(new MapSqlParameterSource().addValue("id", s.id().toString())
                            .addValue("eid", owner.id().toString()).addValue("position", s.position())
                            .addValue("lk", s.loadKind()).addValue("lv", s.load()).addValue("ek", s.effortKind())
                            .addValue("ev", s.effort()).addValue("rest", s.rest()).addValue("tempo", s.tempo())
                            .addValue("notes", s.notes()));
                }
            }
        }
        if (!alts.isEmpty()) {
            jdbc.batchUpdate("""
                    INSERT INTO workout_exercise (id, workout_id, exercise_id, position, alternative_of, notes)
                    VALUES (:id::uuid, :wid::uuid, :exid::uuid, :position, :main::uuid, :notes)
                    """, alts.toArray(SqlParameterSource[]::new));
        }
        if (!setRows.isEmpty()) {
            jdbc.batchUpdate("""
                    INSERT INTO workout_set (id, workout_exercise_id, position, load_kind, load_value, effort_kind,
                                             effort_value, rest_seconds, tempo, notes)
                    VALUES (:id::uuid, :eid::uuid, :position, :lk, :lv, :ek, :ev, :rest, :tempo, :notes)
                    """, setRows.toArray(SqlParameterSource[]::new));
        }
    }

    /** A plan's main exercises, live — what a resync counts before and after. */
    public int mainExercises(UUID programId) {
        Integer n = jdbc.queryForObject("""
                SELECT count(*) FROM workout_exercise we JOIN workout w ON w.id = we.workout_id
                WHERE w.program_id = :plan::uuid AND w.deleted_at IS NULL AND we.alternative_of IS NULL
                """, Map.of("plan", programId.toString()), Integer.class);
        return n == null ? 0 : n;
    }

    /**
     * Replace {@code plan}'s tree with {@code src}'s, keeping each plan workout that still has a
     * counterpart. A plan workout is matched to a source workout through
     * {@code copied_from_workout_id}, so a booked session stays linked wherever the workout exists
     * on both sides; everything below the workout is replaced wholesale. Returns the workouts the
     * plan lost (its own additions, and those the source dropped).
     */
    public List<UUID> resync(UUID plan, UUID src, UUID trainerId) {
        var p = Map.of("plan", plan.toString(), "src", src.toString(), "tid", trainerId.toString());
        List<String> gone = jdbc.queryForList("""
                SELECT id::text FROM workout
                WHERE program_id = :plan::uuid AND deleted_at IS NULL AND (copied_from_workout_id IS NULL
                   OR copied_from_workout_id NOT IN (SELECT id FROM workout WHERE program_id = :src::uuid AND deleted_at IS NULL))
                """, p, String.class);
        if (!gone.isEmpty()) {
            jdbc.update("UPDATE workout SET deleted_at = now() WHERE id = ANY(CAST(:ids AS uuid[]))",
                    Map.of("ids", gone.toArray(String[]::new)));
        }
        jdbc.update("UPDATE workout SET position = position + " + PARK
                + " WHERE program_id = :plan::uuid AND deleted_at IS NULL", p);
        jdbc.update("""
                DELETE FROM workout_exercise WHERE workout_id IN
                    (SELECT id FROM workout WHERE program_id = :plan::uuid AND deleted_at IS NULL)
                """, p);
        jdbc.update("""
                UPDATE workout p SET week = s.week, day = s.day, position = s.position, name = s.name, notes = s.notes
                FROM workout s
                WHERE p.program_id = :plan::uuid AND p.deleted_at IS NULL AND s.id = p.copied_from_workout_id
                  AND s.program_id = :src::uuid AND s.deleted_at IS NULL
                """, p);
        jdbc.update("""
                INSERT INTO workout (id, origin, trainer_id, program_id, week, day, position, name, notes, copied_from_workout_id)
                SELECT gen_random_uuid(), 'trainer', :tid::uuid, :plan::uuid, s.week, s.day, s.position, s.name, s.notes, s.id
                FROM workout s
                WHERE s.program_id = :src::uuid AND s.deleted_at IS NULL AND NOT EXISTS (
                    SELECT 1 FROM workout p WHERE p.program_id = :plan::uuid AND p.deleted_at IS NULL
                      AND p.copied_from_workout_id = s.id)
                """, p);
        jdbc.update("""
                WITH w AS (
                    SELECT s.id AS old, p.id AS new FROM workout s JOIN workout p ON p.copied_from_workout_id = s.id
                    WHERE s.program_id = :src::uuid AND s.deleted_at IS NULL
                      AND p.program_id = :plan::uuid AND p.deleted_at IS NULL
                ),
                e AS (
                    SELECT we.id AS old, gen_random_uuid() AS new, w.new AS wnew, we.exercise_id, we.position,
                           we.alternative_of, we.group_id, we.section, we.notes
                    FROM workout_exercise we JOIN w ON w.old = we.workout_id
                ),
                ei AS (
                    INSERT INTO workout_exercise (id, workout_id, exercise_id, position, alternative_of, group_id, section, notes)
                    SELECT e.new, e.wnew, e.exercise_id, e.position, alt.new, e.group_id, e.section, e.notes
                    FROM e LEFT JOIN e alt ON alt.old = e.alternative_of
                )
                INSERT INTO workout_set (workout_exercise_id, position, load_kind, load_value, effort_kind, effort_value,
                                         rest_seconds, tempo, notes)
                SELECT e.new, s.position, s.load_kind, s.load_value, s.effort_kind, s.effort_value, s.rest_seconds,
                       s.tempo, s.notes
                FROM workout_set s JOIN e ON e.old = s.workout_exercise_id
                """, p);
        return gone.stream().map(UUID::fromString).toList();
    }

    /** The plan now follows the source's length, and is up to date with it. */
    public void markSynced(UUID plan, int weeks, int days) {
        jdbc.update("UPDATE program SET weeks = :weeks, days = :days, synced_at = now(), revised_at = now() WHERE id = :id::uuid",
                Map.of("weeks", weeks, "days", days, "id", plan.toString()));
    }

    private static String str(UUID id) {
        return id == null ? null : id.toString();
    }

    public static String[] strings(Collection<UUID> ids) {
        return ids.stream().map(UUID::toString).toArray(String[]::new);
    }
}
