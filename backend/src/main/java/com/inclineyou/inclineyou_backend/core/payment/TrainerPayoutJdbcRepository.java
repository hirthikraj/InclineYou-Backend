package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.payment.dto.Payout;
import com.inclineyou.inclineyou_backend.core.payment.dto.PayoutFilter;
import com.inclineyou.inclineyou_backend.core.payment.dto.PayoutRecord;
import com.inclineyou.inclineyou_backend.core.payment.dto.RecentPayout;
import com.inclineyou.inclineyou_backend.shared.util.Money;
import com.inclineyou.inclineyou_backend.shared.wire.Cursor;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** All SQL on {@code trainer_payout} — what the gym has actually paid the trainer. The balance is a sum over these rows; nothing stores it. */
@Repository
@RequiredArgsConstructor
public class TrainerPayoutJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    private static final String COLUMNS = """
            id::text AS id, gym_name, gym_place_id::text AS gym_place_id, amount, currency, method, reference, note, received_at, created_at, updated_at""";

    /** One keyset page, newest first, {@code limit + 1} rows so the caller can tell there is more. */
    public List<Payout> page(UUID tid, PayoutFilter f) {
        var p = new HashMap<String, Object>();
        p.put("tid", tid.toString());
        var where = new ArrayList<String>(List.of("trainer_id = :tid::uuid", "deleted_at IS NULL"));
        if (f.gymPlaceId() != null) {
            p.put("gp", f.gymPlaceId());
            where.add("gym_place_id = :gp::uuid");
        } else if (f.gymName() != null) {
            p.put("gym", f.gymName());
            where.add("gym_name = :gym");
        }
        if (f.from() != null) { p.put("from", Timestamp.from(f.from())); where.add("received_at >= :from"); }
        if (f.to() != null) { p.put("to", Timestamp.from(f.to())); where.add("received_at < :to"); }
        if (f.after() != null) {
            p.put("afterAt", f.after().keyAsTimestamp());
            p.put("afterId", f.after().id().toString());
            where.add("(received_at, id) < (:afterAt, :afterId::uuid)");
        }
        p.put("limit", f.limit() + 1);
        return jdbc.query("SELECT " + COLUMNS + " FROM trainer_payout WHERE " + String.join(" AND ", where)
                + " ORDER BY received_at DESC, id DESC LIMIT :limit", p, TrainerPayoutJdbcRepository::row);
    }

    public Optional<Payout> find(UUID tid, UUID id) {
        return jdbc.query("SELECT " + COLUMNS + " FROM trainer_payout WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL",
                Map.of("id", id.toString(), "tid", tid.toString()), TrainerPayoutJdbcRepository::row).stream().findFirst();
    }

    /** 0 when the id already exists as a row this trainer cannot see. */
    public int insert(UUID id, UUID tid, String gymName, String gymPlaceId, BigDecimal amount, String currency,
                      String method, String reference, String note, Timestamp receivedAt) {
        var p = new HashMap<String, Object>();
        p.put("id", id.toString());
        p.put("tid", tid.toString());
        p.put("gym", gymName);
        p.put("gp", gymPlaceId);
        p.put("amount", amount);
        p.put("cur", currency);
        p.put("method", method);
        p.put("ref", reference);
        p.put("note", note);
        p.put("at", receivedAt);
        return jdbc.update("""
                INSERT INTO trainer_payout (id, trainer_id, gym_name, gym_place_id, amount, currency, method, reference, note, received_at)
                VALUES (:id::uuid, :tid::uuid, :gym, :gp::uuid, :amount, :cur, :method, :ref, :note, :at)
                ON CONFLICT (id) DO NOTHING
                """, p);
    }

    public void update(UUID id, UUID tid, BigDecimal amount, String method, String reference, String note, Timestamp receivedAt) {
        var p = new HashMap<String, Object>();
        p.put("id", id.toString());
        p.put("tid", tid.toString());
        p.put("amount", amount);
        p.put("method", method);
        p.put("ref", reference);
        p.put("note", note);
        p.put("at", receivedAt);
        jdbc.update("""
                UPDATE trainer_payout SET amount = :amount, method = :method, reference = :ref, note = :note,
                                          received_at = :at
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, p);
    }

    public void softDelete(UUID tid, UUID id) {
        jdbc.update("""
                UPDATE trainer_payout SET deleted_at = now()
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("id", id.toString(), "tid", tid.toString()));
    }

    // ── for the settlement ──────────────────────────────────────────────

    /** Every live payout, as settlement needs them: which gym, how much, when. */
    public List<PayoutRecord> all(UUID tid) {
        return jdbc.query("""
                SELECT gym_name, amount, received_at, gym_place_id::text FROM trainer_payout
                WHERE trainer_id = :tid::uuid AND deleted_at IS NULL""", Map.of("tid", tid.toString()),
                (rs, i) -> new PayoutRecord(rs.getString(1), rs.getString(4), rs.getBigDecimal(2),
                        rs.getTimestamp(3).toInstant()));
    }

    /** The latest five for one gym; {@code gymKey} is "p:&lt;place id&gt;" or "n:&lt;lower-cased name&gt;". */
    public List<RecentPayout> recent(UUID tid, String gymKey) {
        return jdbc.query("""
                SELECT id::text, amount, method, reference, received_at, note FROM trainer_payout
                WHERE trainer_id = :tid::uuid AND deleted_at IS NULL
                  AND CASE WHEN gym_place_id IS NOT NULL THEN 'p:' || gym_place_id::text
                           ELSE 'n:' || lower(btrim(gym_name)) END = :gym
                ORDER BY received_at DESC, id DESC LIMIT 5""",
                Map.of("tid", tid.toString(), "gym", gymKey),
                (rs, i) -> new RecentPayout(rs.getString(1), Money.format(rs.getBigDecimal(2)), rs.getString(3), rs.getString(4),
                        rs.getTimestamp(5).getTime(), rs.getString(6)));
    }

    private static Payout row(ResultSet rs, int i) throws SQLException {
        Timestamp received = rs.getTimestamp("received_at");
        return new Payout(rs.getString("id"), rs.getString("gym_name"), rs.getString("gym_place_id"),
                Money.format(rs.getBigDecimal("amount")), rs.getString("currency"),
                rs.getString("method"), rs.getString("reference"), rs.getString("note"),
                received.getTime(), rs.getTimestamp("created_at").getTime(),
                String.valueOf(rs.getTimestamp("updated_at").getTime()), Cursor.key(received));
    }
}
