package com.inclineyou.inclineyou_backend.core.workout;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * The SQL on a standalone workout: a {@code workout} row with {@code program_id
 * IS NULL} (Programs A7). Its exercises and sets are the plan tree's own rows,
 * read by {@code ProgramJdbcRepository.exercisesByWorkout} and written by
 * {@code PlanTreeJdbcRepository.replaceExercises}.
 */
@Repository
@RequiredArgsConstructor
public class WorkoutTemplateJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /** The workout row, without its tree. */
    public record Row(String id, String name, String notes, Timestamp createdAt, Timestamp updatedAt) {
        public String version() {
            return String.valueOf(updatedAt.getTime());
        }
    }

    /** The trainer's shelf, most recently touched first (idx_workout_shelf). */
    public List<Row> shelf(UUID trainerId) {
        return jdbc.query("""
                SELECT id::text, name, notes, created_at, updated_at FROM workout
                WHERE trainer_id = :tid::uuid AND program_id IS NULL AND deleted_at IS NULL
                ORDER BY updated_at DESC, id
                """, Map.of("tid", trainerId.toString()), ROW);
    }

    /**
     * The shelf's mains and the effort of each of their sets, keyed by workout id, in plan order — what the list's
     * counts and {@code estimatedMinutes} are made of, and none of what it does not send (ids, loads, tempo, notes,
     * alternatives). One query, walking idx_workout_shelf, uq_workout_exercise_order and uq_workout_set_order.
     */
    public Map<String, List<WorkoutEstimate.Movement>> shelfMovements(UUID trainerId) {
        var out = new LinkedHashMap<String, List<WorkoutEstimate.Movement>>();
        var current = new String[1];
        jdbc.query("""
                SELECT we.workout_id::text, we.id::text, we.group_id::text, s.effort_kind, s.effort_value, s.rest_seconds
                FROM workout w
                JOIN workout_exercise we ON we.workout_id = w.id AND we.alternative_of IS NULL
                LEFT JOIN workout_set s ON s.workout_exercise_id = we.id
                WHERE w.trainer_id = :tid::uuid AND w.program_id IS NULL AND w.deleted_at IS NULL
                ORDER BY we.workout_id, we.position, s.position
                """, Map.of("tid", trainerId.toString()), rs -> {
            List<WorkoutEstimate.Movement> movements = out.computeIfAbsent(rs.getString(1), k -> new ArrayList<>());
            if (!rs.getString(2).equals(current[0])) {
                current[0] = rs.getString(2);
                movements.add(new WorkoutEstimate.Movement(rs.getString(3), new ArrayList<>()));
            }
            if (rs.getString(4) != null) {   // null: a main with no sets, from the LEFT JOIN
                BigDecimal value = rs.getBigDecimal(5);
                movements.getLast().sets().add(new WorkoutEstimate.Effort(rs.getString(4),
                        value == null ? null : value.doubleValue(), (Integer) rs.getObject(6)));
            }
        });
        return out;
    }

    public Optional<Row> find(UUID trainerId, UUID id) {
        return jdbc.query("""
                SELECT id::text, name, notes, created_at, updated_at FROM workout
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND program_id IS NULL AND deleted_at IS NULL
                """, Map.of("id", id.toString(), "tid", trainerId.toString()), ROW).stream().findFirst();
    }

    /** The same row, locked for a save. */
    public Optional<Row> lock(UUID trainerId, UUID id) {
        return jdbc.query("""
                SELECT id::text, name, notes, created_at, updated_at FROM workout
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND program_id IS NULL AND deleted_at IS NULL
                FOR UPDATE
                """, Map.of("id", id.toString(), "tid", trainerId.toString()), ROW).stream().findFirst();
    }

    /** Does this id exist, and is it the trainer's live standalone workout? Empty when nothing has it. */
    public Optional<Boolean> ownership(UUID trainerId, UUID id) {
        return jdbc.queryForList("""
                SELECT (trainer_id = :tid::uuid AND program_id IS NULL AND deleted_at IS NULL) FROM workout
                WHERE id = :id::uuid
                """, Map.of("id", id.toString(), "tid", trainerId.toString()), Boolean.class).stream().findFirst();
    }

    public void insert(UUID id, UUID trainerId, String name, String notes) {
        jdbc.update("""
                INSERT INTO workout (id, origin, trainer_id, name, notes)
                VALUES (:id::uuid, 'trainer', :tid::uuid, :name, :notes)
                """, new MapSqlParameterSource("id", id.toString()).addValue("tid", trainerId.toString())
                .addValue("name", name).addValue("notes", notes));
    }

    /** Always runs on a save, so the row's {@code updated_at} — the version — moves even when only the tree did. */
    public void update(UUID id, String name, String notes) {
        jdbc.update("UPDATE workout SET name = :name, notes = :notes WHERE id = :id::uuid",
                new MapSqlParameterSource("id", id.toString()).addValue("name", name).addValue("notes", notes));
    }

    public void retire(UUID id) {
        jdbc.update("UPDATE workout SET deleted_at = now() WHERE id = :id::uuid", Map.of("id", id.toString()));
    }

    private static final org.springframework.jdbc.core.RowMapper<Row> ROW = (rs, i) -> new Row(rs.getString(1),
            rs.getString(2), rs.getString(3), rs.getTimestamp(4), rs.getTimestamp(5));
}
