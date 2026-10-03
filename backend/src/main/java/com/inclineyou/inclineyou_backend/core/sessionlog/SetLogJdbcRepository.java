package com.inclineyou.inclineyou_backend.core.sessionlog;

import com.inclineyou.inclineyou_backend.core.sessionlog.dto.SetRow;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static com.inclineyou.inclineyou_backend.core.sessionlog.LogSql.score;
import static com.inclineyou.inclineyou_backend.core.sessionlog.LogSql.uuid;

/**
 * The statements behind a single set: finding it under its session, writing its actuals, adding and deleting an extra
 * one, and the comparison a PR flash needs. set_log has no trainer id, so every lookup joins up to the session.
 */
@Repository
@RequiredArgsConstructor
public class SetLogJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /** A set, with the exercise and session it sits under, read under {@code FOR UPDATE OF sl}. */
    public record SetCtx(UUID setId, UUID sxId, UUID exerciseId, UUID clientId, UUID sessionId, boolean removed,
                         boolean started, boolean planned, String loadKind, String effortKind, BigDecimal targetLoad,
                         BigDecimal targetEffort, BigDecimal loadValue, BigDecimal effortValue, BigDecimal rpe,
                         Timestamp doneAt) {}

    public Optional<SetCtx> lock(UUID trainerId, UUID sessionId, UUID setId) {
        return jdbc.query("""
                SELECT sl.id, se.id AS sx_id, se.exercise_id, se.client_id, s.id AS session_id, se.removed_at, s.started_at,
                       sl.planned, sl.load_kind, sl.effort_kind, sl.target_load_value, sl.target_effort_value,
                       sl.load_value, sl.effort_value, sl.rpe, sl.done_at
                FROM set_log sl
                JOIN session_exercise se ON se.id = sl.session_exercise_id
                JOIN scheduled_session s ON s.id = se.session_id
                WHERE sl.id = :set::uuid AND s.id = :sid::uuid AND s.trainer_id = :tid::uuid AND s.deleted_at IS NULL
                FOR UPDATE OF sl
                """, Map.of("set", setId.toString(), "sid", sessionId.toString(), "tid", trainerId.toString()),
                (rs, i) -> new SetCtx(uuid(rs.getObject("id")), uuid(rs.getObject("sx_id")), uuid(rs.getObject("exercise_id")),
                        uuid(rs.getObject("client_id")), uuid(rs.getObject("session_id")), rs.getTimestamp("removed_at") != null,
                        rs.getTimestamp("started_at") != null, rs.getBoolean("planned"), rs.getString("load_kind"),
                        rs.getString("effort_kind"), rs.getBigDecimal("target_load_value"), rs.getBigDecimal("target_effort_value"),
                        rs.getBigDecimal("load_value"), rs.getBigDecimal("effort_value"), rs.getBigDecimal("rpe"),
                        rs.getTimestamp("done_at"))).stream().findFirst();
    }

    /** Write actuals and mark done. {@code done_at} is kept on a re-send — a retried tap changes nothing. */
    public void writeDone(UUID setId, BigDecimal load, BigDecimal effort, BigDecimal rpe) {
        var p = new HashMap<String, Object>();
        p.put("id", setId.toString());
        p.put("l", load);
        p.put("e", effort);
        p.put("r", rpe);
        jdbc.update("UPDATE set_log SET load_value = :l, effort_value = :e, rpe = :r, done_at = coalesce(done_at, now()) "
                + "WHERE id = :id::uuid", p);
    }

    /** A set's note on its own — null clears it. Never touches the actuals or {@code done_at}. */
    public void writeNotes(UUID setId, String notes) {
        var p = new HashMap<String, Object>();
        p.put("id", setId.toString());
        p.put("n", notes);
        jdbc.update("UPDATE set_log SET notes = :n WHERE id = :id::uuid", p);
    }

    /** Un-log or skip: actuals cleared, the row stays. */
    public void clear(UUID setId) {
        jdbc.update("UPDATE set_log SET load_value = NULL, effort_value = NULL, rpe = NULL, done_at = NULL WHERE id = :id::uuid",
                Map.of("id", setId.toString()));
    }

    public SetRow row(UUID setId) {
        return jdbc.queryForObject("SELECT * FROM set_log WHERE id = :id::uuid", Map.of("id", setId.toString()),
                (rs, i) -> SessionLogJdbcRepository.setRow(rs));
    }

    /**
     * The best ranking value among the client's OTHER done sets for this exercise in the same kinds — completed
     * sessions and this session's earlier sets. Empty when there is nothing to beat, so a first-ever set is not a PR.
     */
    public Optional<BigDecimal> bestOther(UUID trainerId, UUID sessionId, UUID clientId, UUID exerciseId, UUID setId,
                                          String loadKind, String effortKind) {
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("sid", sessionId.toString());
        p.put("cid", clientId.toString());
        p.put("ex", exerciseId.toString());
        p.put("set", setId.toString());
        p.put("lk", loadKind);
        p.put("ek", effortKind);
        return Optional.ofNullable(jdbc.queryForObject("""
                SELECT max(%s) FROM set_log o
                JOIN session_exercise ox ON ox.id = o.session_exercise_id AND ox.removed_at IS NULL
                JOIN scheduled_session os ON os.id = ox.session_id
                WHERE ox.client_id = :cid::uuid AND ox.exercise_id = :ex::uuid AND o.id <> :set::uuid
                  AND o.done_at IS NOT NULL AND o.load_kind = :lk AND o.effort_kind = :ek
                  AND os.trainer_id = :tid::uuid AND os.deleted_at IS NULL AND (os.status = 'done' OR os.id = :sid::uuid)
                """.formatted(score("o")), p, BigDecimal.class));
    }

    /** This set's own ranking value, as the row now stands. */
    public BigDecimal scoreOf(UUID setId) {
        return jdbc.queryForObject("SELECT " + score("sl") + " FROM set_log sl WHERE sl.id = :id::uuid",
                Map.of("id", setId.toString()), BigDecimal.class);
    }

    // ── extra sets ───────────────────────────────────────────────────────────────────────────────

    /** The highest position on an exercise, 0 when it has no sets. Read under the exercise's row lock. */
    public int maxPosition(UUID sxId) {
        return jdbc.queryForObject("SELECT coalesce(max(position), 0) FROM set_log WHERE session_exercise_id = :sx::uuid",
                Map.of("sx", sxId.toString()), Integer.class);
    }

    /** The kinds of the exercise's last set, so an extra set defaults to what was just being done. */
    public Optional<String[]> lastKinds(UUID sxId) {
        return jdbc.query("SELECT load_kind, effort_kind FROM set_log WHERE session_exercise_id = :sx::uuid "
                        + "ORDER BY position DESC LIMIT 1", Map.of("sx", sxId.toString()),
                (rs, i) -> new String[]{rs.getString("load_kind"), rs.getString("effort_kind")}).stream().findFirst();
    }

    /** An existing set (this trainer's) by id: the replay of a client-minted id. Returns its exercise id with the row. */
    public Optional<Map.Entry<UUID, SetRow>> findOwned(UUID trainerId, UUID setId) {
        return jdbc.query("""
                SELECT sl.*, sl.session_exercise_id AS sx FROM set_log sl
                JOIN session_exercise se ON se.id = sl.session_exercise_id
                JOIN scheduled_session s ON s.id = se.session_id
                WHERE sl.id = :id::uuid AND s.trainer_id = :tid::uuid
                """, Map.of("id", setId.toString(), "tid", trainerId.toString()),
                (rs, i) -> Map.entry(uuid(rs.getObject("sx")), SessionLogJdbcRepository.setRow(rs))).stream().findFirst();
    }

    /** An extra set is always a logged one (the schema's set_log_done: only a planned row may be empty). */
    public void insertExtra(UUID id, UUID sxId, int position, String loadKind, String effortKind, BigDecimal load,
                            BigDecimal effort, BigDecimal rpe, String notes) {
        var p = new HashMap<String, Object>();
        p.put("id", id.toString());
        p.put("sx", sxId.toString());
        p.put("notes", notes);
        p.put("pos", position);
        p.put("lk", loadKind);
        p.put("ek", effortKind);
        p.put("l", load);
        p.put("e", effort);
        p.put("r", rpe);
        jdbc.update("""
                INSERT INTO set_log (id, session_exercise_id, position, planned, load_kind, effort_kind, load_value,
                                     effort_value, rpe, notes, done_at)
                VALUES (:id::uuid, :sx::uuid, :pos, false, :lk, :ek, :l, :e, :r, :notes, now())
                """, p);
    }

    public int delete(UUID setId) {
        return jdbc.update("DELETE FROM set_log WHERE id = :id::uuid", Map.of("id", setId.toString()));
    }
}
