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
     * <p>{@code scope} narrows WHICH packages are totalled, never how: {@code ""} is the trainer's
     * whole book, {@link #ONE_CLIENT} one client's, {@link #ONE_PACKAGE} one package. It used to be
     * the whole book every time, so the client file's header and every money write's answer totalled
     * every payment the trainer had ever taken to show one row.
     *
     * <p>Payments are reached through the scoped package ids, not through {@code payment.trainer_id}:
     * that makes the sums an index-only pass over {@code idx_payment_package (package_id) INCLUDE
     * (amount, status) WHERE deleted_at IS NULL}, one probe per package, and it counts every payment
     * on the trainer's own package ({@code payment_package_owner} ties a payment to its package's
     * client and workspace). Filtering on {@code trainer_id} instead walked {@code idx_payment_ledger}
     * and read every row.
     *
     * <p>The ONE definition: the package list, a single package, a client's balance and "owed today"
     * in the money summary all read it, so "pending" there and "owed" on a pack can never be two
     * different sums.
     */
    private static String ledger(String scope) {
        return """
            scoped AS (
                SELECT id FROM package
                WHERE trainer_id = :tid::uuid AND deleted_at IS NULL%s
            ),
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
                    WHERE package_id IN (SELECT id FROM scoped) AND deleted_at IS NULL
                    GROUP BY package_id
                ) pay ON pay.package_id = k.id
                WHERE k.id IN (SELECT id FROM scoped)
            )""".formatted(scope);
    }

    private static final String ONE_CLIENT = " AND client_id = :cid::uuid";

    /**
     * A single session's sale for a day still to come, with nothing paid on it (10 Nov 2026): sold at booking, but not
     * owed until the session's day — so it is left out of what "owes" means everywhere (scope=current, the money
     * summary), and a client booked four weeks ahead does not read as owing for all of it today. Once paid on, or once
     * the day comes, it is an ordinary package with money on it. Needs {@code :today}.
     */
    private static final String NOT_YET_OWED =
            "(session_id IS NOT NULL AND status = 'active' AND due_date > :today AND amount_paid = 0)";
    private static final String ONE_PACKAGE = " AND id = :pid::uuid";

    private static final String COLUMNS = """
            SELECT id::text AS id, client_id::text AS client_id, pack_id::text AS pack_id, name,
                   service, basis, sessions_total, sessions_remaining, amount, discount_amount,
                   currency, start_date::text AS start_date, end_date::text AS end_date,
                   due_date::text AS due_date, status, paused_at, paused_days,
                   trainer_share_percent, trainer_share_amount, amount_paid, amount_refunded,
                   amount_due, closed_at, created_at, updated_at, session_id::text AS session_id
            """;

    // ── reads ───────────────────────────────────────────────────────────

    /**
     * {@code current} is three sets, unioned: every live pack; every pack with money still owed
     * whatever its status (a finished pack can still be owed for); and each client's newest pack even
     * if closed, because the per-session rate and Renew both need the last agreed terms. Without it,
     * {@code clientId} gives every package that client bought. The shape is the same either way.
     * Bounded, so no cursor; newest first, then id.
     */
    public List<CurrentPackage> list(UUID trainerId, boolean current, UUID clientId, LocalDate today) {
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("today", Date.valueOf(today));
        String scope = "";
        if (clientId != null) {
            p.put("cid", clientId.toString());
            scope = ONE_CLIENT;
        }
        // One client's newest is still their newest when only their packages are ranked.
        return jdbc.query("WITH " + ledger(scope) + """
                , ranked AS (
                    -- A single session's own sale (V32, session_id set) is ranked after every real pack, so a
                    -- client's newest is the last pack they bought, whose terms Renew copies.
                    SELECT l.*, row_number() OVER (PARTITION BY l.client_id
                                                   ORDER BY (l.session_id IS NOT NULL), l.created_at DESC, l.id DESC) AS newest
                    FROM ledger l
                )
                """ + COLUMNS + """
                FROM ranked
                WHERE %s
                ORDER BY created_at DESC, id
                """.formatted(current ? "(status = 'active' OR amount_due > 0 OR newest = 1) AND NOT " + NOT_YET_OWED : "true"),
                p, PackageJdbcRepository::row);
    }

    /** Is this client on this trainer's roster (not deleted)? {@code GET /v1/packages?clientId=} answers 404 otherwise. */
    public boolean clientIsMine(UUID trainerId, UUID clientId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM client WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)
                """, Map.of("cid", clientId.toString(), "tid", trainerId.toString()), Boolean.class));
    }

    /** Is this package in this trainer's books (not deleted)? {@code GET /v1/payments?packageId=} answers 404 otherwise. */
    public boolean packageIsMine(UUID trainerId, UUID packageId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM package WHERE id = :pid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)
                """, Map.of("pid", packageId.toString(), "tid", trainerId.toString()), Boolean.class));
    }

    /** One package in the L5 shape — what a write that creates one answers with. Empty if not this trainer's. */
    public Optional<CurrentPackage> one(UUID trainerId, UUID packageId) {
        return jdbc.query("WITH " + ledger(ONE_PACKAGE) + COLUMNS + """
                FROM ledger WHERE id = :pid::uuid
                """, Map.of("tid", trainerId.toString(), "pid", packageId.toString()), PackageJdbcRepository::row)
                .stream().findFirst();
    }

    /**
     * What one client still owes across every package, off the ONE ledger definition above — the client's own portal reads it, so what they are
     * shown as owing and what the trainer's books say can never be two different sums. Zero, not null, when nothing is owed.
     */
    public java.math.BigDecimal dueForClient(UUID trainerId, UUID clientId) {
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("cid", clientId.toString());
        return jdbc.queryForObject("WITH " + ledger(ONE_CLIENT) + " SELECT coalesce(sum(amount_due), 0) FROM ledger", p, java.math.BigDecimal.class);
    }

    /**
     * Owed as of today, across every package: pending is all of it, overdue is what is past its
     * due date by more than the grace ({@code overdueBefore} is the cut-off day).
     */
    public DueTotals dues(UUID trainerId, LocalDate overdueBefore, LocalDate today) {
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("today", Date.valueOf(today));
        p.put("overdueBefore", Date.valueOf(overdueBefore));
        return jdbc.queryForObject("WITH " + ledger("") + """
                SELECT coalesce(sum(amount_due), 0) AS pending,
                       coalesce(sum(amount_due) FILTER (WHERE due_date < :overdueBefore), 0) AS overdue,
                       count(DISTINCT client_id) FILTER (WHERE amount_due > 0) AS owing,
                       count(DISTINCT client_id) FILTER (WHERE amount_due > 0 AND due_date < :overdueBefore) AS overdue_clients
                FROM ledger
                WHERE NOT """ + NOT_YET_OWED + """

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
                String.valueOf(rs.getTimestamp("updated_at").getTime()),
                null,
                rs.getString("session_id"));
    }

    /**
     * V32: per client and service, the trainer bookings still to be marked that a pack will pay for — {@code scheduled},
     * billed to a pack, from 30 days back (the window Today closes out). Keyed {@code clientId|service}; the service is
     * the one Mark done charges (the session's mode, else its slot's, else the client's default). On
     * idx_scheduled_session_diary.
     */
    public Map<String, Integer> bookedAhead(UUID trainerId, UUID clientId) {
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        String one = "";
        if (clientId != null) {
            p.put("cid", clientId.toString());
            one = " AND s.client_id = :cid::uuid";
        }
        var out = new HashMap<String, Integer>();
        jdbc.query("""
                SELECT s.client_id::text AS cid,
                       coalesce(s.delivery_mode, sl.delivery_mode, cs.delivery_mode, 'floor') AS service,
                       count(*) AS n
                FROM scheduled_session s
                LEFT JOIN client_schedule_slot sl ON sl.id = s.slot_id
                LEFT JOIN client_schedule cs ON cs.client_id = s.client_id
                WHERE s.trainer_id = :tid::uuid AND s.deleted_at IS NULL AND s.logged_by = 'trainer'
                  AND s.status = 'scheduled' AND s.billing = 'pack'
                  AND s.scheduled_at >= now() - interval '30 days'""" + one + """

                GROUP BY 1, 2
                """, p, rs -> { out.put(rs.getString("cid") + "|" + rs.getString("service"), rs.getInt("n")); });
        return out;
    }

    private static Long epochOrNull(Timestamp ts) {
        return ts == null ? null : ts.getTime();
    }

    private static Integer intOrNull(ResultSet rs, String column) throws SQLException {
        int v = rs.getInt(column);
        return rs.wasNull() ? null : v;
    }

    // ── taking back a sale just made (9 Nov 2026) ────────────────────────

    /**
     * The package an Undo is about, locked, and what has happened to it since the sale. Two statements on purpose
     * (11 Nov 2026): the lock first, then the read. In READ COMMITTED a single {@code SELECT … FOR UPDATE} that waited
     * for a concurrent Mark done still answered its {@code EXISTS} from the snapshot taken BEFORE the wait, so it missed
     * the charge that had just committed and the Undo went ahead. The second statement takes a fresh snapshot, after
     * the lock, and sees it.
     */
    public Optional<com.inclineyou.inclineyou_backend.core.payment.dto.UndoTarget> lockForUndo(UUID trainerId, UUID packageId,
                                                                                            int windowMinutes) {
        var p = Map.<String, Object>of("pid", packageId.toString(), "tid", trainerId.toString(), "window", windowMinutes);
        if (jdbc.queryForList("SELECT 1 FROM package WHERE id = :pid::uuid AND trainer_id = :tid::uuid FOR UPDATE",
                p).isEmpty()) {
            return Optional.empty();
        }
        return jdbc.query("""
                SELECT p.deleted_at IS NOT NULL AS deleted, p.session_id IS NOT NULL AS single_sale,
                       p.created_at > now() - make_interval(mins => :window) AS fresh,
                       (EXISTS (SELECT 1 FROM payment y WHERE y.package_id = p.id AND y.deleted_at IS NULL)
                        OR EXISTS (SELECT 1 FROM package_adjustment a WHERE a.package_id = p.id
                                   AND NOT (a.kind = 'session' AND a.created_at = p.created_at))) AS touched
                FROM package p
                WHERE p.id = :pid::uuid
                """, p,
                (rs, i) -> new com.inclineyou.inclineyou_backend.core.payment.dto.UndoTarget(
                        rs.getBoolean("deleted"), rs.getBoolean("fresh"), rs.getBoolean("touched"),
                        rs.getBoolean("single_sale")))
                .stream().findFirst();
    }

    /** Give back the sessions the sale took: their charges are reversed (never deleted), so they wait for a pack again. */
    public int reverseSaleCharges(UUID packageId) {
        return jdbc.update("""
                UPDATE package_adjustment a SET reversed_at = now()
                WHERE a.package_id = :pid::uuid AND a.kind = 'session' AND a.reversed_at IS NULL
                  -- Only the sale's own back-charges (option B, written in the sale's transaction, so stamped with the
                  -- package's created_at). A charge Mark done wrote later is never taken back by an Undo (11 Nov 2026).
                  AND a.created_at = (SELECT k.created_at FROM package k WHERE k.id = a.package_id)
                """, Map.of("pid", packageId.toString()));
    }

    /** The Undo itself: gone from every read (deleted_at), and closed so nothing can charge it in the meantime. */
    /**
     * Gone without a trace. A sale that turned a prospect into a client (V34) takes that back too — while they are
     * still active, so a client paused or archived since keeps the state the trainer gave them.
     */
    public void takeBack(UUID packageId) {
        jdbc.queryForList("""
                WITH k AS (
                    UPDATE package SET deleted_at = now(), status = 'cancelled', closed_at = coalesce(closed_at, now())
                    WHERE id = :pid::uuid
                    RETURNING client_id, activated_client
                )
                UPDATE client SET status = 'prospect'
                WHERE id = (SELECT client_id FROM k) AND status = 'active' AND (SELECT activated_client FROM k)
                RETURNING 1
                """, Map.of("pid", packageId.toString()));
    }

    // ── delivered sessions a new pack takes (V32) ───────────────────────

    /**
     * The named sessions that are still waiting for a pack — this client's trainer bookings, delivered, billed to a
     * pack, with no live charge, for this service — locked, oldest first. A session that is not all of those is simply
     * not returned; the caller compares counts.
     */
    public List<UUID> lockUncharged(UUID trainerId, UUID clientId, String service, List<UUID> ids) {
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("cid", clientId.toString());
        p.put("service", service);
        p.put("ids", ids);
        return jdbc.query("""
                SELECT s.id::text AS id
                FROM scheduled_session s
                LEFT JOIN client_schedule_slot sl ON sl.id = s.slot_id
                LEFT JOIN client_schedule cs ON cs.client_id = s.client_id
                WHERE s.id IN (:ids) AND s.trainer_id = :tid::uuid AND s.client_id = :cid::uuid
                  AND s.deleted_at IS NULL AND s.logged_by = 'trainer' AND s.status = 'done' AND s.billing = 'pack'
                  AND coalesce(s.delivery_mode, sl.delivery_mode, cs.delivery_mode, 'floor') = :service
                  AND NOT EXISTS (SELECT 1 FROM package_adjustment a
                                  WHERE a.session_id = s.id AND a.kind = 'session' AND a.reversed_at IS NULL)
                ORDER BY s.scheduled_at, s.id
                FOR UPDATE OF s
                """, p, (rs, i) -> UUID.fromString(rs.getString("id")));
    }

    /** The same charge Mark done writes; tenant_id is stamped by the trigger, the decrement is apply_package_adjustment's. */
    public void insertSessionCharge(UUID trainerId, UUID packageId, UUID clientId, UUID sessionId) {
        jdbc.update("""
                INSERT INTO package_adjustment (trainer_id, package_id, client_id, kind, sessions, session_id)
                VALUES (:tid::uuid, :pid::uuid, :cid::uuid, 'session', -1, :sid::uuid)
                """, Map.of("tid", trainerId.toString(), "pid", packageId.toString(), "cid", clientId.toString(),
                "sid", sessionId.toString()));
    }

    /** A pack the back-charge used up closes in the same transaction, as Mark done's would (1.1, L5). */
    public void closeIfUsedUp(UUID packageId) {
        jdbc.update("""
                UPDATE package SET status = 'completed', closed_at = now()
                WHERE id = :pid::uuid AND status = 'active' AND sessions_remaining = 0
                """, Map.of("pid", packageId.toString()));
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

    /**
     * A prospect sold a pack is an active client from that sale on. The sale records that it was the one
     * ({@code package.activated_client}, V34), so an Undo of it can put them back.
     */
    public void activateProspect(UUID clientId, UUID packageId) {
        jdbc.queryForList("""
                WITH c AS (
                    UPDATE client SET status = 'active' WHERE id = :cid::uuid AND status = 'prospect' RETURNING id
                )
                UPDATE package SET activated_client = true WHERE id = :pid::uuid AND EXISTS (SELECT 1 FROM c)
                RETURNING 1
                """, Map.of("cid", clientId.toString(), "pid", packageId.toString()));
    }

    // ── a renewal ───────────────────────────────────────────────────────

    /** The package being renewed, with its pack's current terms when that pack is still on the price list. */
    public Optional<RenewSource> renewSource(UUID trainerId, UUID packageId) {
        return jdbc.query("""
                SELECT k.client_id::text AS client_id, k.pack_id::text AS pack_id, k.name, k.service, k.basis,
                       k.sessions_total, k.amount, k.currency, k.start_date, k.end_date,
                       k.trainer_share_percent, k.trainer_share_amount, k.created_at, k.session_id IS NOT NULL AS single_sale,
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
                        rs.getBigDecimal("pack_share_percent"), rs.getBigDecimal("pack_share_amount"),
                        rs.getBoolean("single_sale"))).stream().findFirst();
    }

    /**
     * A package an earlier attempt with this id made: empty when no row has the id yet; otherwise
     * whether it is this trainer's, for the same client as the package being renewed.
     */
    public Optional<RenewReplay> renewReplayMine(UUID trainerId, UUID newId, UUID renewedId) {
        return jdbc.queryForList("""
                SELECT (n.trainer_id = :tid::uuid AND n.client_id = o.client_id) AS mine,
                       n.deleted_at IS NOT NULL AS undone
                FROM package n LEFT JOIN package o ON o.id = :pid::uuid
                WHERE n.id = :newId::uuid
                """, Map.of("tid", trainerId.toString(), "pid", renewedId.toString(), "newId", newId.toString()))
                .stream().findFirst()
                .map(r -> new RenewReplay(Boolean.TRUE.equals(r.get("mine")), Boolean.TRUE.equals(r.get("undone"))));
    }

    /**
     * What a renew's id already names: whether that package is this trainer's, for the same client, and whether it
     * was undone since (soft-deleted by {@code DELETE /v1/packages/{id}}, 9 Nov 2026).
     */
    public record RenewReplay(boolean mine, boolean undone) {}


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
                      -- A paused pack counts (9 Nov 2026): pausing does not undo the sale, so renewing again
                      -- would sell a third pack. Only a pack that is over (closed, cancelled or undone) frees it.
                      AND status = 'active' AND deleted_at IS NULL
                      AND session_id IS NULL   -- a single session booked since is not a renewal (13 Nov 2026)
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
