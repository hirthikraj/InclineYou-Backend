package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.payment.dto.Adjustment;
import com.inclineyou.inclineyou_backend.core.payment.dto.CurrentPackage;
import com.inclineyou.inclineyou_backend.core.payment.dto.DueTotals;
import com.inclineyou.inclineyou_backend.core.payment.dto.LockedPackage;
import com.inclineyou.inclineyou_backend.core.payment.dto.NewPackage;
import com.inclineyou.inclineyou_backend.core.payment.dto.RenewSource;
import com.inclineyou.inclineyou_backend.core.payment.dto.SaleClient;
import com.inclineyou.inclineyou_backend.core.payment.dto.SalePack;
import com.inclineyou.inclineyou_backend.shared.util.Money;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * All SQL on {@code package} (what one client bought) and its append-only
 * {@code package_adjustment} log. The price list is {@link PackJdbcRepository}'s and the money
 * moved against a package is {@link PaymentJdbcRepository}'s.
 *
 * <p>Read through RLS, which scopes {@code package} and {@code payment} to the active workspace
 * alone — the money book never spans workspaces, unlike the diary.
 */
@Repository
@RequiredArgsConstructor
public class PackageJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /**
     * What each package still owes: {@code amount} less what was paid and what was written off,
     * never below zero. {@code amount} is already net — the schema's {@code discount_amount} only
     * records why it is below the list price — so the discount is NOT subtracted again (the 1.0
     * draft did, and under-reported every discounted pack). A cancelled or refunded package owes
     * nothing — the sale was undone, and chasing it would be chasing money nobody agreed to pay.
     *
     * <p>All three sums come off idx_payment_package (package_id) INCLUDE (amount, status),
     * index-only, in one grouped pass.
     *
     * <p>The ONE definition: the package list, a single package, and "owed today" in the money
     * summary all read it, so "pending" there and "owed" on a pack can never be two different sums.
     */
    private static final String LEDGER_CTE = """
            ledger AS (
                SELECT k.*,
                       coalesce(pay.paid, 0) AS amount_paid,
                       coalesce(pay.refunded, 0) AS amount_refunded,
                       CASE WHEN k.status IN ('cancelled', 'refunded') THEN 0
                            ELSE greatest(k.amount - coalesce(pay.paid, 0) - coalesce(pay.written_off, 0), 0)
                       END AS amount_due
                FROM package k
                LEFT JOIN (
                    SELECT package_id,
                           sum(amount) FILTER (WHERE status = 'paid') AS paid,
                           sum(amount) FILTER (WHERE status = 'write_off') AS written_off,
                           sum(amount) FILTER (WHERE status = 'refund') AS refunded
                    FROM payment
                    WHERE trainer_id = :tid::uuid AND deleted_at IS NULL
                    GROUP BY package_id
                ) pay ON pay.package_id = k.id
                WHERE k.trainer_id = :tid::uuid AND k.deleted_at IS NULL
            )""";

    private static final String COLUMNS = """
            SELECT id::text AS id, client_id::text AS client_id, pack_id::text AS pack_id, name,
                   service, basis, sessions_total, sessions_remaining, amount, discount_amount,
                   currency, start_date::text AS start_date, end_date::text AS end_date,
                   due_date::text AS due_date, status, paused_at, paused_days,
                   trainer_share_percent, trainer_share_amount, amount_paid, amount_refunded,
                   amount_due, closed_at, created_at, updated_at
            """;

    // ── reads ───────────────────────────────────────────────────────────

    /**
     * {@code current} is three sets, unioned: every live pack; every pack with money still owed
     * whatever its status (a finished pack can still be owed for); and each client's newest pack even
     * if closed, because the per-session rate and Renew both need the last agreed terms. Without it,
     * {@code clientId} gives every package that client bought. The shape is the same either way.
     * Bounded, so no cursor; newest first, then id.
     */
    public List<CurrentPackage> list(UUID trainerId, boolean current, UUID clientId) {
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        String byClient = "";
        if (clientId != null) {
            p.put("cid", clientId.toString());
            byClient = " AND client_id = :cid::uuid";
        }
        return jdbc.query("WITH " + LEDGER_CTE + """
                , ranked AS (
                    SELECT l.*, row_number() OVER (PARTITION BY l.client_id
                                                   ORDER BY l.created_at DESC, l.id DESC) AS newest
                    FROM ledger l
                )
                """ + COLUMNS + """
                FROM ranked
                WHERE %s%s
                ORDER BY created_at DESC, id
                """.formatted(current ? "(status = 'active' OR amount_due > 0 OR newest = 1)" : "true", byClient),
                p, PackageJdbcRepository::row);
    }

    /** One package in the L5 shape — what a write that creates one answers with. Empty if not this trainer's. */
    public Optional<CurrentPackage> one(UUID trainerId, UUID packageId) {
        return jdbc.query("WITH " + LEDGER_CTE + COLUMNS + """
                FROM ledger WHERE id = :pid::uuid
                """, Map.of("tid", trainerId.toString(), "pid", packageId.toString()), PackageJdbcRepository::row)
                .stream().findFirst();
    }

    /**
     * Owed as of today, across every package: pending is all of it, overdue is what is past its
     * due date by more than the grace ({@code overdueBefore} is the cut-off day).
     */
    public DueTotals dues(UUID trainerId, LocalDate overdueBefore) {
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("overdueBefore", Date.valueOf(overdueBefore));
        return jdbc.queryForObject("WITH " + LEDGER_CTE + """
                SELECT coalesce(sum(amount_due), 0) AS pending,
                       coalesce(sum(amount_due) FILTER (WHERE due_date < :overdueBefore), 0) AS overdue,
                       count(DISTINCT client_id) FILTER (WHERE amount_due > 0) AS owing,
                       count(DISTINCT client_id) FILTER (WHERE amount_due > 0 AND due_date < :overdueBefore) AS overdue_clients
                FROM ledger
                """, p, (rs, i) -> new DueTotals(rs.getBigDecimal("pending"), rs.getBigDecimal("overdue"),
                rs.getInt("owing"), rs.getInt("overdue_clients")));
    }

    private static CurrentPackage row(ResultSet rs, int i) throws SQLException {
        Timestamp paused = rs.getTimestamp("paused_at");
        return new CurrentPackage(
                rs.getString("id"),
                rs.getString("client_id"),
                rs.getString("pack_id"),
                rs.getString("name"),
                rs.getString("service"),
                rs.getString("basis"),
                intOrNull(rs, "sessions_total"),
                intOrNull(rs, "sessions_remaining"),
                Money.format(rs.getBigDecimal("amount")),
                Money.format(rs.getBigDecimal("discount_amount")),
                rs.getString("currency"),
                rs.getString("start_date"),
                rs.getString("end_date"),
                rs.getString("due_date"),
                rs.getString("status"),
                paused == null ? null : paused.getTime(),
                rs.getInt("paused_days"),
                Money.format(rs.getBigDecimal("trainer_share_percent")),
                Money.format(rs.getBigDecimal("trainer_share_amount")),
                Money.format(rs.getBigDecimal("amount_paid")),
                Money.format(rs.getBigDecimal("amount_refunded")),
                Money.format(rs.getBigDecimal("amount_due")),
                epochOrNull(rs.getTimestamp("closed_at")),
                rs.getTimestamp("created_at").getTime(),
                String.valueOf(rs.getTimestamp("updated_at").getTime()));
    }

    private static Long epochOrNull(Timestamp ts) {
        return ts == null ? null : ts.getTime();
    }

    private static Integer intOrNull(ResultSet rs, String column) throws SQLException {
        int v = rs.getInt(column);
        return rs.wasNull() ? null : v;
    }

    // ── a sale ──────────────────────────────────────────────────────────

    /** The client a sale is for, locked: two sales to one client queue behind each other. */
    public Optional<SaleClient> lockClient(UUID trainerId, UUID clientId) {
        return jdbc.query("""
                SELECT status, client_type FROM client
                WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL FOR UPDATE
                """, Map.of("tid", trainerId.toString(), "cid", clientId.toString()),
                (rs, i) -> new SaleClient(rs.getString("status"), rs.getString("client_type"))).stream().findFirst();
    }

    /** Whether a package id already exists, and if so whether it is this trainer's, for this client. */
    public Optional<Boolean> belongsTo(UUID trainerId, UUID clientId, UUID packageId) {
        return jdbc.queryForList("""
                SELECT (trainer_id = :tid::uuid AND client_id = :cid::uuid) AS mine FROM package WHERE id = :id::uuid
                """, Map.of("tid", trainerId.toString(), "cid", clientId.toString(), "id", packageId.toString()))
                .stream().findFirst().map(r -> Boolean.TRUE.equals(r.get("mine")));
    }

    public Optional<SalePack> pack(UUID trainerId, UUID packId) {
        return jdbc.query("""
                SELECT name, service, basis, sessions, validity_days, amount, currency, owner, status,
                       trainer_share_percent, trainer_share_amount
                FROM pack WHERE id = :pk::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("pk", packId.toString(), "tid", trainerId.toString()),
                (rs, i) -> new SalePack(rs.getString("name"), rs.getString("service"), rs.getString("basis"),
                        (Integer) rs.getObject("sessions"), (Integer) rs.getObject("validity_days"),
                        rs.getBigDecimal("amount"), rs.getString("currency"), rs.getString("owner"), rs.getString("status"),
                        rs.getBigDecimal("trainer_share_percent"), rs.getBigDecimal("trainer_share_amount")))
                .stream().findFirst();
    }

    /**
     * Inserts the package; 0 when the id already exists as a row this trainer cannot see (another
     * workspace) — the caller reports that as a collided id, never as a package it created.
     * tenant_id is stamped by the trigger.
     */
    public int insert(NewPackage n) {
        var p = new HashMap<String, Object>();
        p.put("id", n.id().toString());
        p.put("tid", n.trainerId().toString());
        p.put("cid", n.clientId().toString());
        p.put("packId", n.packId() == null ? null : n.packId().toString());
        p.put("name", n.name());
        p.put("service", n.service());
        p.put("basis", n.basis());
        p.put("sessions", n.sessions());
        p.put("amount", n.amount());
        p.put("discount", n.discount());
        p.put("currency", n.currency());
        p.put("start", Date.valueOf(n.start()));
        p.put("end", n.end() == null ? null : Date.valueOf(n.end()));
        p.put("due", Date.valueOf(n.due()));
        p.put("sharePercent", n.sharePercent());
        p.put("shareAmount", n.shareAmount());
        return jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, pack_id, name, service, basis, sessions_total,
                                     sessions_remaining, amount, discount_amount, currency, start_date, end_date, due_date,
                                     trainer_share_percent, trainer_share_amount)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, :packId::uuid, :name, :service, :basis, :sessions,
                        :sessions, :amount, :discount, :currency, :start, :end, :due, :sharePercent, :shareAmount)
                ON CONFLICT (id) DO NOTHING
                """, p);
    }

    public void activateProspect(UUID clientId) {
        jdbc.update("UPDATE client SET status = 'active' WHERE id = :cid::uuid AND status = 'prospect'",
                Map.of("cid", clientId.toString()));
    }

    // ── a renewal ───────────────────────────────────────────────────────

    /** The package being renewed, with its pack's current terms when that pack is still on the price list. */
    public Optional<RenewSource> renewSource(UUID trainerId, UUID packageId) {
        return jdbc.query("""
                SELECT k.client_id::text AS client_id, k.pack_id::text AS pack_id, k.name, k.service, k.basis,
                       k.sessions_total, k.amount, k.currency, k.start_date, k.end_date,
                       k.trainer_share_percent, k.trainer_share_amount, k.created_at,
                       pk.id IS NOT NULL AS pack_live, pk.name AS pack_name, pk.service AS pack_service,
                       pk.basis AS pack_basis, pk.sessions AS pack_sessions, pk.amount AS pack_amount,
                       pk.currency AS pack_currency, pk.validity_days AS pack_validity,
                       pk.trainer_share_percent AS pack_share_percent, pk.trainer_share_amount AS pack_share_amount
                FROM package k
                LEFT JOIN pack pk ON pk.id = k.pack_id AND pk.status = 'active' AND pk.deleted_at IS NULL
                WHERE k.id = :pid::uuid AND k.trainer_id = :tid::uuid AND k.deleted_at IS NULL
                """, Map.of("tid", trainerId.toString(), "pid", packageId.toString()),
                (rs, i) -> new RenewSource(rs.getString("client_id"), rs.getString("pack_id"), rs.getString("name"),
                        rs.getString("service"), rs.getString("basis"), (Integer) rs.getObject("sessions_total"),
                        rs.getBigDecimal("amount"), rs.getString("currency"), rs.getDate("start_date"), rs.getDate("end_date"),
                        rs.getBigDecimal("trainer_share_percent"), rs.getBigDecimal("trainer_share_amount"),
                        rs.getTimestamp("created_at"), rs.getBoolean("pack_live"), rs.getString("pack_name"),
                        rs.getString("pack_service"), rs.getString("pack_basis"), (Integer) rs.getObject("pack_sessions"),
                        rs.getBigDecimal("pack_amount"), rs.getString("pack_currency"), (Integer) rs.getObject("pack_validity"),
                        rs.getBigDecimal("pack_share_percent"), rs.getBigDecimal("pack_share_amount"))).stream().findFirst();
    }

    /**
     * A package an earlier attempt with this id made: empty when no row has the id yet; otherwise
     * whether it is this trainer's, for the same client as the package being renewed.
     */
    public Optional<Boolean> renewReplayMine(UUID trainerId, UUID newId, UUID renewedId) {
        return jdbc.queryForList("""
                SELECT (n.trainer_id = :tid::uuid AND n.client_id = o.client_id) AS mine
                FROM package n LEFT JOIN package o ON o.id = :pid::uuid
                WHERE n.id = :newId::uuid
                """, Map.of("tid", trainerId.toString(), "pid", renewedId.toString(), "newId", newId.toString()))
                .stream().findFirst().map(r -> Boolean.TRUE.equals(r.get("mine")));
    }

    /** Serialises two renews of the same client: the second then sees the first one's package. */
    public void lockClientRow(UUID clientId) {
        jdbc.queryForList("SELECT id FROM client WHERE id = :cid::uuid FOR UPDATE", Map.of("cid", clientId.toString()));
    }

    /** Is there a running, unpaused pack for this service newer than the one being renewed? */
    public boolean renewedSince(UUID clientId, String service, UUID packageId, Timestamp oldCreated) {
        var p = new HashMap<String, Object>();
        p.put("cid", clientId.toString());
        p.put("service", service);
        p.put("pid", packageId.toString());
        p.put("oldCreated", oldCreated);
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM package
                    WHERE client_id = :cid::uuid AND service = :service AND id <> :pid::uuid
                      AND status = 'active' AND paused_at IS NULL AND deleted_at IS NULL
                      AND created_at > :oldCreated)
                """, p, Boolean.class));
    }

    // ── what a ledger write decides from ────────────────────────────────

    /** The trainer's package, locked, with its client's type. Empty if not theirs. */
    public Optional<LockedPackage> lock(UUID trainerId, UUID packageId) {
        return jdbc.query("""
                SELECT k.id, k.client_id, k.status, k.amount, k.currency, k.paused_at, k.end_date, c.client_type
                FROM package k JOIN client c ON c.id = k.client_id
                WHERE k.id = :pid::uuid AND k.trainer_id = :tid::uuid AND k.deleted_at IS NULL
                FOR UPDATE OF k""", Map.of("pid", packageId.toString(), "tid", trainerId.toString()),
                (rs, i) -> new LockedPackage((UUID) rs.getObject("id"), (UUID) rs.getObject("client_id"),
                        rs.getString("status"), rs.getBigDecimal("amount"), rs.getString("currency"),
                        rs.getTimestamp("paused_at"), rs.getDate("end_date"), rs.getString("client_type")))
                .stream().findFirst();
    }

    public boolean isMine(UUID trainerId, UUID packageId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM package WHERE id = :pid::uuid AND trainer_id = :tid::uuid
                               AND deleted_at IS NULL)""",
                Map.of("tid", trainerId.toString(), "pid", packageId.toString()), Boolean.class));
    }

    /** Oldest first on idx_package_adjustment_package. Bounded: one pack's history. {@code kinds} null = all. */
    public List<Adjustment> adjustments(UUID packageId, List<String> kinds) {
        var p = new HashMap<String, Object>();
        p.put("pid", packageId.toString());
        String byKind = "";
        if (kinds != null) {
            p.put("kinds", kinds);
            byKind = " AND kind IN (:kinds)";
        }
        return jdbc.query("""
                SELECT id::text AS id, kind, days, sessions, session_id::text AS session_id, reason, effective_at,
                       due_date::text AS due_date, previous_due_date::text AS previous_due_date, reversed_at, created_at
                FROM package_adjustment WHERE package_id = :pid::uuid%s
                ORDER BY effective_at, id
                """.formatted(byKind), p, (rs, i) -> new Adjustment(
                rs.getString("id"), rs.getString("kind"), rs.getInt("days"), rs.getInt("sessions"),
                rs.getString("session_id"), rs.getString("reason"), rs.getTimestamp("effective_at").getTime(),
                rs.getString("due_date"), rs.getString("previous_due_date"),
                rs.getTimestamp("reversed_at") == null ? null : rs.getTimestamp("reversed_at").getTime(),
                rs.getTimestamp("created_at").getTime()));
    }

    /** apply_package_adjustment applies the row to the package, under the same row lock. */
    public void insertAdjustment(UUID trainerId, LockedPackage k, String kind, int days, String reason, Timestamp at) {
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("pid", k.id().toString());
        p.put("cid", k.clientId().toString());
        p.put("kind", kind);
        p.put("days", days);
        p.put("reason", reason);
        p.put("at", at);
        jdbc.update("""
                INSERT INTO package_adjustment (trainer_id, package_id, client_id, kind, days, reason, effective_at)
                VALUES (:tid::uuid, :pid::uuid, :cid::uuid, :kind, :days, :reason, :at)""", p);
    }

    /** A child-row write moves its parent's version (Conventions · Concurrency). */
    public void touch(UUID packageId) {
        jdbc.update("UPDATE package SET updated_at = now() WHERE id = :pid::uuid", Map.of("pid", packageId.toString()));
    }

    public void cancel(UUID packageId) {
        jdbc.update("UPDATE package SET status = 'cancelled', closed_at = now() WHERE id = :pid::uuid",
                Map.of("pid", packageId.toString()));
    }

    /** The schema wants the refund row and the refunded status in one transaction. */
    public void markRefunded(UUID packageId) {
        jdbc.update("UPDATE package SET status = 'refunded', closed_at = coalesce(closed_at, now()) WHERE id = :pid::uuid",
                Map.of("pid", packageId.toString()));
    }
}
