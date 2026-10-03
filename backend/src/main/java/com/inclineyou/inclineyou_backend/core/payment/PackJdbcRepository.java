package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.payment.dto.PackOwnership;
import com.inclineyou.inclineyou_backend.core.payment.dto.PackRow;
import com.inclineyou.inclineyou_backend.core.payment.dto.PackShape;
import com.inclineyou.inclineyou_backend.shared.util.Money;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * All SQL on {@code pack} — the price list. A package (what one client bought) is
 * {@link PackageJdbcRepository}'s. The rules — what a valid pack is, who may change it —
 * are {@link PackService}'s; this class only reads and writes rows.
 */
@Repository
@RequiredArgsConstructor
public class PackJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    private static final String ROW_COLUMNS = """
            p.id::text AS id, p.name, p.service, p.basis, p.sessions, p.validity_days, p.amount, p.currency,
            p.owner, p.trainer_share_percent, p.trainer_share_amount, p.status, p.order_index, p.updated_at""";

    /**
     * The trainer's live packs, ordered by orderIndex then id. Usage is one grouped pass over
     * idx_package_pack, and only when asked for.
     */
    public List<PackRow> list(UUID trainerId, boolean activeOnly, String owner, boolean usage) {
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        var where = new ArrayList<String>(List.of("p.trainer_id = :tid::uuid", "p.deleted_at IS NULL"));
        if (activeOnly) where.add("p.status = 'active'");
        if (owner != null) {
            p.put("owner", owner);
            where.add("p.owner = :owner");
        }
        p.put("usage", usage);
        return jdbc.query("""
                SELECT %s, u.active_clients, u.sold
                FROM pack p
                LEFT JOIN (
                    SELECT pack_id, count(DISTINCT client_id) FILTER (WHERE status = 'active') AS active_clients,
                           count(*) AS sold
                    FROM package WHERE trainer_id = :tid::uuid AND pack_id IS NOT NULL AND deleted_at IS NULL AND :usage
                    GROUP BY pack_id
                ) u ON u.pack_id = p.id
                WHERE %s
                ORDER BY p.order_index, p.id
                """.formatted(ROW_COLUMNS, String.join(" AND ", where)), p, (rs, i) -> row(rs, usage));
    }

    /** One live pack in the list shape; empty if it is not this trainer's. */
    public Optional<PackRow> find(UUID trainerId, UUID packId) {
        return jdbc.query("SELECT " + ROW_COLUMNS + """
                 FROM pack p WHERE p.id = :id::uuid AND p.trainer_id = :tid::uuid AND p.deleted_at IS NULL
                """, Map.of("id", packId.toString(), "tid", trainerId.toString()), (rs, i) -> row(rs, false))
                .stream().findFirst();
    }

    /** As {@link #find}, locking the row — a PATCH reads, merges and writes under it. */
    public Optional<PackRow> lockLive(UUID trainerId, UUID packId) {
        return jdbc.query("SELECT " + ROW_COLUMNS + """
                , p.deleted_at FROM pack p
                WHERE p.id = :id::uuid AND p.trainer_id = :tid::uuid AND p.deleted_at IS NULL FOR UPDATE
                """, Map.of("id", packId.toString(), "tid", trainerId.toString()), (rs, i) -> row(rs, false))
                .stream().findFirst();
    }

    /** Whose a pack id is, whatever its state — RLS may hide another workspace's, which reads as absent. */
    public Optional<PackOwnership> ownership(UUID packId) {
        return jdbc.query("SELECT trainer_id::text AS tid, deleted_at FROM pack WHERE id = :id::uuid",
                Map.of("id", packId.toString()),
                (rs, i) -> new PackOwnership(rs.getString("tid"), rs.getTimestamp("deleted_at") != null))
                .stream().findFirst();
    }

    /** Inserts an active pack. A unique violation (the name, or the id) is left to the caller to read. */
    public void insert(UUID packId, UUID trainerId, PackShape s, String currency, int orderIndex) {
        var p = params(s);
        p.put("id", packId.toString());
        p.put("tid", trainerId.toString());
        p.put("currency", currency);
        p.put("orderIndex", orderIndex);
        jdbc.update("""
                INSERT INTO pack (id, trainer_id, name, service, basis, sessions, validity_days, amount, currency,
                                  owner, trainer_share_percent, trainer_share_amount, status, order_index)
                VALUES (:id::uuid, :tid::uuid, :name, :service, :basis, :sessions, :validityDays, :amount, :currency,
                        :owner, :pct, :shareAmount, 'active', :orderIndex)
                """, p);
    }

    public void update(UUID packId, UUID trainerId, PackShape s, String status, int orderIndex) {
        var p = params(s);
        p.put("id", packId.toString());
        p.put("tid", trainerId.toString());
        p.put("status", status);
        p.put("orderIndex", orderIndex);
        jdbc.update("""
                UPDATE pack SET name = :name, service = :service, basis = :basis, sessions = :sessions,
                       validity_days = :validityDays, amount = :amount, trainer_share_percent = :pct,
                       trainer_share_amount = :shareAmount, status = :status, order_index = :orderIndex
                WHERE id = :id::uuid AND trainer_id = :tid::uuid
                """, p);
    }

    /** A gym pack needs a gym to belong to. */
    public boolean hasGymName(UUID trainerId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM trainer_business
                               WHERE trainer_id = :tid::uuid AND btrim(coalesce(gym_name, '')) <> '')
                """, Map.of("tid", trainerId.toString()), Boolean.class));
    }

    /** Is a live pack already called this (case-insensitively), other than {@code except}? */
    public boolean nameTaken(UUID trainerId, String name, UUID except) {
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("name", name.strip());
        p.put("except", except == null ? null : except.toString());
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM pack WHERE trainer_id = :tid::uuid AND deleted_at IS NULL
                               AND lower(name) = lower(:name)
                               AND (CAST(:except AS uuid) IS NULL OR id <> CAST(:except AS uuid)))
                """, p, Boolean.class));
    }

    public int nextOrder(UUID trainerId) {
        Integer max = jdbc.queryForObject("SELECT max(order_index) FROM pack WHERE trainer_id = :tid::uuid AND deleted_at IS NULL",
                Map.of("tid", trainerId.toString()), Integer.class);
        return max == null ? 0 : max + 1;
    }

    // ── delete ──────────────────────────────────────────────────────────

    /** Locks the trainer's pack row for a delete. Empty if it is not theirs; the flag says it is already deleted. */
    public Optional<Boolean> lockForDelete(UUID trainerId, UUID packId) {
        return jdbc.queryForList("SELECT deleted_at FROM pack WHERE id = :id::uuid AND trainer_id = :tid::uuid FOR UPDATE",
                Map.of("id", packId.toString(), "tid", trainerId.toString()))
                .stream().findFirst().map(r -> r.get("deleted_at") != null);
    }

    /** Packages ever sold from it, deleted ones too: the foreign key would still point at it. */
    public int soldCount(UUID packId) {
        Integer sold = jdbc.queryForObject("SELECT count(*) FROM package WHERE pack_id = :id::uuid",
                Map.of("id", packId.toString()), Integer.class);
        return sold == null ? 0 : sold;
    }

    public void softDelete(UUID trainerId, UUID packId) {
        jdbc.update("UPDATE pack SET deleted_at = now() WHERE id = :id::uuid AND trainer_id = :tid::uuid",
                Map.of("id", packId.toString(), "tid", trainerId.toString()));
    }

    // ── mapping ─────────────────────────────────────────────────────────

    private static PackRow row(ResultSet rs, boolean usage) throws SQLException {
        BigDecimal amount = rs.getBigDecimal("amount");
        BigDecimal pct = rs.getBigDecimal("trainer_share_percent");   // a percentage is a JSON number, not money
        BigDecimal share = rs.getBigDecimal("trainer_share_amount");
        // What the gym keeps — derived on read, never stored (R3).
        BigDecimal gymPct = pct == null ? null : BigDecimal.valueOf(100).subtract(pct);
        String gymAmt = null;
        if (pct != null) {
            gymAmt = Money.format(amount.multiply(gymPct).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP));
        } else if (share != null) {
            gymAmt = Money.format(amount.subtract(share));
            gymPct = amount.signum() == 0 ? null
                    : amount.subtract(share).multiply(BigDecimal.valueOf(100)).divide(amount, 2, RoundingMode.HALF_UP);
        }
        return new PackRow(
                rs.getString("id"), rs.getString("name"), rs.getString("service"), rs.getString("basis"),
                (Integer) rs.getObject("sessions"), (Integer) rs.getObject("validity_days"),
                Money.format(amount), rs.getString("currency"), rs.getString("owner"),
                pct, Money.format(share), gymPct, gymAmt,
                rs.getString("status"), rs.getInt("order_index"),
                String.valueOf(rs.getTimestamp("updated_at").getTime()),
                usage ? rs.getInt("active_clients") : null, usage ? rs.getInt("sold") : null);
    }

    private static Map<String, Object> params(PackShape s) {
        var p = new LinkedHashMap<String, Object>();
        p.put("name", s.name());
        p.put("service", s.service());
        p.put("basis", s.basis());
        p.put("sessions", s.sessions());
        p.put("validityDays", s.validityDays());
        p.put("amount", s.amount());
        p.put("owner", s.owner());
        p.put("pct", s.pct());
        p.put("shareAmount", s.shareAmount());
        return p;
    }
}
