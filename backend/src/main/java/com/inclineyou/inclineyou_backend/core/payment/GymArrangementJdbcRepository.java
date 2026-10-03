package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.payment.dto.Arrangement;
import com.inclineyou.inclineyou_backend.core.payment.dto.CurrentGym;
import com.inclineyou.inclineyou_backend.core.payment.dto.RunningTerms;
import com.inclineyou.inclineyou_backend.shared.util.Money;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.YearMonth;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * All SQL on {@code gym_arrangement} — the pay terms with a gym that is not on InclineYou (R51),
 * and the trainer's current gym as the profile holds it. The schema allows ONE running row per
 * trainer ({@code uq_gym_arrangement_open}), and since V7 closed rows cannot overlap either.
 */
@Repository
@RequiredArgsConstructor
public class GymArrangementJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    private static final String COLUMNS = """
            id::text AS id, gym_name, gym_place_id::text AS gym_place_id, base_kind, base_amount, currency, starts_month, ends_month, note,
            created_at, updated_at""";

    /** Every live row, the running one first, then by startsMonth newest first. */
    public List<Arrangement> list(UUID tid) {
        return jdbc.query("SELECT " + COLUMNS + """
                 FROM gym_arrangement WHERE trainer_id = :tid::uuid AND deleted_at IS NULL
                ORDER BY (ends_month IS NULL) DESC, starts_month DESC, id
                """, Map.of("tid", tid.toString()), GymArrangementJdbcRepository::row);
    }

    /** The running arrangement, if any. */
    public Optional<Arrangement> running(UUID tid) {
        return jdbc.query("SELECT " + COLUMNS + """
                 FROM gym_arrangement WHERE trainer_id = :tid::uuid AND deleted_at IS NULL AND ends_month IS NULL
                """, Map.of("tid", tid.toString()), GymArrangementJdbcRepository::row).stream().findFirst();
    }

    public Optional<Arrangement> find(UUID tid, UUID id) {
        return jdbc.query("SELECT " + COLUMNS + """
                 FROM gym_arrangement WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("id", id.toString(), "tid", tid.toString()), GymArrangementJdbcRepository::row).stream().findFirst();
    }

    /** The gym the trainer is with now: its name as a snapshot, and the directory place when it was picked from the search. */
    public Optional<CurrentGym> currentGym(UUID tid) {
        return jdbc.query("SELECT gym_name, gym_place_id::text FROM trainer_business WHERE trainer_id = :tid::uuid",
                Map.of("tid", tid.toString()), (rs, i) -> new CurrentGym(rs.getString(1), rs.getString(2)))
                .stream().filter(g -> g.name() != null).findFirst();
    }

    /** The running row, locked so two taps cannot both close it. */
    public Optional<RunningTerms> lockRunning(UUID tid) {
        return jdbc.query("""
                SELECT id::text AS id, starts_month FROM gym_arrangement
                WHERE trainer_id = :tid::uuid AND deleted_at IS NULL AND ends_month IS NULL FOR UPDATE
                """, Map.of("tid", tid.toString()),
                (rs, i) -> new RunningTerms(rs.getString("id"), YearMonth.from(rs.getDate("starts_month").toLocalDate())))
                .stream().findFirst();
    }

    /** How many closed rows already cover {@code starts} or later. */
    public int closedCovering(UUID tid, YearMonth starts) {
        Integer n = jdbc.queryForObject("""
                SELECT count(*) FROM gym_arrangement
                WHERE trainer_id = :tid::uuid AND deleted_at IS NULL AND ends_month IS NOT NULL AND ends_month >= :s
                """, Map.of("tid", tid.toString(), "s", Date.valueOf(starts.atDay(1))), Integer.class);
        return n == null ? 0 : n;
    }

    /** Ends a row the month before new terms begin. */
    public void close(String id, YearMonth endsMonth) {
        jdbc.update("UPDATE gym_arrangement SET ends_month = :e WHERE id = :id::uuid",
                Map.of("e", Date.valueOf(endsMonth.atDay(1)), "id", id));
    }

    /** 0 when the id already exists as a row this trainer cannot see. */
    public int insert(UUID id, UUID tid, CurrentGym gym, String kind, BigDecimal base, String currency,
                      YearMonth starts, String note) {
        var p = new HashMap<String, Object>();
        p.put("id", id.toString());
        p.put("tid", tid.toString());
        p.put("gym", gym.name());
        p.put("gp", gym.placeId());
        p.put("kind", kind);
        p.put("base", base);
        p.put("cur", currency);
        p.put("s", Date.valueOf(starts.atDay(1)));
        p.put("note", note);
        return jdbc.update("""
                INSERT INTO gym_arrangement (id, trainer_id, gym_name, gym_place_id, base_kind, base_amount, currency, starts_month, note)
                VALUES (:id::uuid, :tid::uuid, :gym, :gp::uuid, :kind, :base, :cur, :s, :note)
                ON CONFLICT (id) DO NOTHING
                """, p);
    }

    public void update(UUID id, UUID tid, String kind, BigDecimal base, String note) {
        var p = new HashMap<String, Object>();
        p.put("id", id.toString());
        p.put("tid", tid.toString());
        p.put("kind", kind);
        p.put("base", base);
        p.put("note", note);
        jdbc.update("""
                UPDATE gym_arrangement SET base_kind = :kind, base_amount = :base, note = :note
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, p);
    }

    public void softDelete(UUID tid, UUID id) {
        jdbc.update("""
                UPDATE gym_arrangement SET deleted_at = now()
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("id", id.toString(), "tid", tid.toString()));
    }

    private static Arrangement row(ResultSet rs, int i) throws SQLException {
        long updated = rs.getTimestamp("updated_at").getTime();
        var ends = rs.getDate("ends_month");
        return new Arrangement(rs.getString("id"), rs.getString("gym_name"), rs.getString("gym_place_id"), rs.getString("base_kind"),
                Money.format(rs.getBigDecimal("base_amount")), rs.getString("currency"),
                YearMonth.from(rs.getDate("starts_month").toLocalDate()).toString(),
                ends == null ? null : YearMonth.from(ends.toLocalDate()).toString(),
                rs.getString("note"), rs.getTimestamp("created_at").getTime(), updated, String.valueOf(updated));
    }
}
