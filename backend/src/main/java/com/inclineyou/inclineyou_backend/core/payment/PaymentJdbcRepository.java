package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.payment.dto.LedgerFilter;
import com.inclineyou.inclineyou_backend.core.payment.dto.LockedPayment;
import com.inclineyou.inclineyou_backend.core.payment.dto.NewPayment;
import com.inclineyou.inclineyou_backend.core.payment.dto.PaymentPatch;
import com.inclineyou.inclineyou_backend.core.payment.dto.PaymentRef;
import com.inclineyou.inclineyou_backend.core.payment.dto.PaymentRow;
import com.inclineyou.inclineyou_backend.core.payment.dto.PaymentSums;
import com.inclineyou.inclineyou_backend.core.payment.dto.Split;
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

/**
 * All SQL on {@code payment}: the ledger's pages, and the writes against a package's money.
 * Which writes are allowed, and what a refusal says, are {@link PackageLedgerService}'s — the
 * database triggers behind these statements are the backstop, and their exceptions pass through
 * untouched for the service to read.
 */
@Repository
@RequiredArgsConstructor
public class PaymentJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /** The instant a payment row counts on — a generated column since V7 (R85), so one index serves the page. */
    private static final String BOOK_AT = "y.book_at";

    /** The ledger row's SELECT, over one WHERE; ordered for the page. */
    private static final String PAYMENT_SELECT = """
            SELECT y.id::text AS id, y.client_id::text AS client_id, y.package_id::text AS package_id,
                   c.name AS client_name, k.name AS package_name,
                   y.amount, y.currency, y.collected_by, y.method, y.status, y.reference, y.note,
                   y.paid_at, y.written_off_at, y.refunded_at, y.created_at, y.updated_at,
                   """ + BOOK_AT + """
             AS book_at, sh.share
            FROM payment y
            JOIN client c ON c.id = y.client_id
            JOIN package k ON k.id = y.package_id
            LEFT JOIN payment_trainer_share sh ON sh.payment_id = y.id
            WHERE %s
            ORDER BY book_at DESC, y.id DESC
            LIMIT :limit
            """;

    // ── the ledger ──────────────────────────────────────────────────────

    /**
     * One keyset page, bookAt descending, {@code limit + 1} rows so the caller can tell there is
     * more. Names and the split are joined for the page only, so the join costs a page, not the book.
     */
    public List<PaymentRow> page(UUID trainerId, LedgerFilter f) {
        var p = new HashMap<String, Object>();
        var where = where(trainerId, f, p);
        if (f.after() != null) {
            p.put("afterAt", f.after().keyAsTimestamp());
            p.put("afterId", f.after().id().toString());
            where.add("(" + BOOK_AT + ", y.id) < (:afterAt, :afterId::uuid)");
        }
        p.put("limit", f.limit() + 1);
        return jdbc.query(PAYMENT_SELECT.formatted(String.join(" AND ", where)), p, PaymentJdbcRepository::row);
    }

    /** How many rows the filter matches, cursor ignored — one indexed COUNT. */
    public int count(UUID trainerId, LedgerFilter f) {
        var p = new HashMap<String, Object>();
        var where = where(trainerId, f, p);
        Integer n = jdbc.queryForObject(
                "SELECT count(*) FROM payment y JOIN client c ON c.id = y.client_id WHERE " + String.join(" AND ", where),
                p, Integer.class);
        return n == null ? 0 : n;
    }

    private static List<String> where(UUID trainerId, LedgerFilter f, Map<String, Object> p) {
        p.put("tid", trainerId.toString());
        var where = new ArrayList<String>(List.of("y.trainer_id = :tid::uuid", "y.deleted_at IS NULL"));
        in(f.statuses(), "statuses", "y.status", p, where);
        in(f.methods(), "methods", "y.method", p, where);
        in(f.collectors(), "collectors", "y.collected_by", p, where);
        in(f.clientTypes(), "clientTypes", "c.client_type", p, where);
        if (f.clientId() != null) {
            p.put("cid", f.clientId().toString());
            where.add("y.client_id = :cid::uuid");
        }
        if (f.packageId() != null) {
            p.put("pid", f.packageId().toString());
            where.add("y.package_id = :pid::uuid");
        }
        if (f.from() != null) {
            p.put("from", Timestamp.from(f.from()));
            where.add(BOOK_AT + " >= :from");
        }
        if (f.to() != null) {
            p.put("to", Timestamp.from(f.to()));
            where.add(BOOK_AT + " < :to");
        }
        return where;
    }

    private static void in(List<String> values, String key, String column, Map<String, Object> p, List<String> where) {
        if (values == null) return;
        p.put(key, values);
        where.add(column + " IN (:" + key + ")");
    }

    /** One payment in the ledger's shape — what every money write answers with. Empty if not this trainer's. */
    public Optional<PaymentRow> find(UUID trainerId, UUID paymentId) {
        return jdbc.query(PAYMENT_SELECT.formatted("y.id = :yid::uuid AND y.trainer_id = :tid::uuid"),
                Map.of("tid", trainerId.toString(), "yid", paymentId.toString(), "limit", 1),
                PaymentJdbcRepository::row).stream().findFirst();
    }

    private static PaymentRow row(ResultSet rs, int i) throws SQLException {
        BigDecimal amount = rs.getBigDecimal("amount");
        BigDecimal share = rs.getBigDecimal("share");
        // Negative on a refund in the view; the split names parts of THIS
        // row's amount, so it is shown as magnitudes.
        Split split = share == null ? null
                : new Split(Money.format(amount.subtract(share.abs())), Money.format(share.abs()));
        return new PaymentRow(
                rs.getString("id"),
                rs.getString("client_id"),
                rs.getString("package_id"),
                rs.getString("client_name"),
                rs.getString("package_name"),
                Money.format(amount),
                rs.getString("currency"),
                rs.getString("collected_by"),
                rs.getString("method"),
                rs.getString("status"),
                rs.getString("reference"),
                rs.getString("note"),
                epochOrNull(rs.getTimestamp("paid_at")),
                epochOrNull(rs.getTimestamp("written_off_at")),
                epochOrNull(rs.getTimestamp("refunded_at")),
                rs.getTimestamp("book_at").getTime(),
                split,
                rs.getTimestamp("created_at").getTime(),
                String.valueOf(rs.getTimestamp("updated_at").getTime()),
                Cursor.key(rs.getTimestamp("book_at")));
    }

    private static Long epochOrNull(Timestamp ts) {
        return ts == null ? null : ts.getTime();
    }

    // ── what a write decides from ───────────────────────────────────────

    /** A live payment of this trainer's. */
    public Optional<LockedPayment> findLive(UUID trainerId, UUID paymentId) {
        return jdbc.query("""
                SELECT package_id, status, amount, method, reference, note, updated_at FROM payment
                WHERE id = :yid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL""",
                Map.of("yid", paymentId.toString(), "tid", trainerId.toString()),
                (rs, i) -> new LockedPayment((UUID) rs.getObject("package_id"), rs.getString("status"),
                        rs.getBigDecimal("amount"), rs.getString("method"), rs.getString("reference"),
                        rs.getString("note"), rs.getTimestamp("updated_at"))).stream().findFirst();
    }

    /** The payment row whether or not it is deleted — what an idempotent DELETE looks at. */
    public Optional<PaymentRef> ref(UUID trainerId, UUID paymentId) {
        return jdbc.query("""
                SELECT package_id, status, deleted_at FROM payment WHERE id = :yid::uuid AND trainer_id = :tid::uuid
                """, Map.of("yid", paymentId.toString(), "tid", trainerId.toString()),
                (rs, i) -> new PaymentRef((UUID) rs.getObject("package_id"), rs.getString("status"),
                        rs.getTimestamp("deleted_at"))).stream().findFirst();
    }

    /** A package's live money by status. */
    public PaymentSums sums(UUID packageId) {
        return jdbc.queryForObject("""
                SELECT coalesce(sum(amount) FILTER (WHERE status = 'paid'), 0) AS paid,
                       coalesce(sum(amount) FILTER (WHERE status = 'write_off'), 0) AS written_off,
                       coalesce(sum(amount) FILTER (WHERE status = 'pending'), 0) AS pending
                FROM payment WHERE package_id = :pid::uuid AND deleted_at IS NULL""",
                Map.of("pid", packageId.toString()), (rs, i) -> new PaymentSums(
                        rs.getBigDecimal("paid"), rs.getBigDecimal("written_off"), rs.getBigDecimal("pending")));
    }

    /** Whether a payment id already exists, and if so whether it is this trainer's on this package. */
    public Optional<Boolean> belongsTo(UUID trainerId, UUID paymentId, UUID packageId) {
        return jdbc.queryForList("""
                SELECT (trainer_id = :tid::uuid AND package_id = :pid::uuid) AS mine FROM payment WHERE id = :id::uuid
                """, Map.of("tid", trainerId.toString(), "pid", packageId.toString(), "id", paymentId.toString()))
                .stream().findFirst().map(r -> Boolean.TRUE.equals(r.get("mine")));
    }

    /** The package's pending rows, oldest first. */
    public List<UUID> pendingIds(UUID packageId) {
        return jdbc.queryForList("""
                SELECT id FROM payment WHERE package_id = :pid::uuid AND status = 'pending' AND deleted_at IS NULL
                ORDER BY created_at, id""", Map.of("pid", packageId.toString()), UUID.class);
    }

    // ── writes (the triggers are the backstop; their exceptions pass through) ──

    /** A payment received now or expected. collected_by is stamped by stamp_payment_collector; the value here is overwritten. */
    public int insertRecorded(NewPayment n) {
        return jdbc.update("""
                INSERT INTO payment (id, trainer_id, client_id, package_id, amount, currency, collected_by,
                                     method, status, reference, paid_at, note)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, :pid::uuid, :amount, :currency, 'trainer',
                        :method, :status, :reference, :paidAt, :note)
                ON CONFLICT (id) DO NOTHING
                """, params(n));
    }

    /** What is left to forgive on a package, as one write_off row. */
    public int insertWriteOff(NewPayment n) {
        return jdbc.update("""
                INSERT INTO payment (id, trainer_id, client_id, package_id, amount, currency, collected_by,
                                     status, written_off_at, note)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, :pid::uuid, :amount, :currency, 'trainer',
                        'write_off', now(), :note)
                ON CONFLICT (id) DO NOTHING""", params(n));
    }

    public int insertRefund(NewPayment n) {
        return jdbc.update("""
                INSERT INTO payment (id, trainer_id, client_id, package_id, amount, currency, collected_by,
                                     method, status, reference, refunded_at, note)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, :pid::uuid, :amount, :currency, 'trainer',
                        :method, 'refund', :reference, :at, :note)
                ON CONFLICT (id) DO NOTHING""", params(n));
    }

    private static Map<String, Object> params(NewPayment n) {
        var p = new HashMap<String, Object>();
        p.put("id", n.id().toString());
        p.put("tid", n.trainerId().toString());
        p.put("pid", n.packageId().toString());
        p.put("cid", n.clientId().toString());
        p.put("amount", n.amount());
        p.put("currency", n.currency());
        p.put("method", n.method());
        p.put("status", n.status());
        p.put("reference", n.reference());
        p.put("paidAt", n.paidAt());
        p.put("at", n.refundedAt());
        p.put("note", n.note());
        return p;
    }

    public int markPaid(UUID paymentId, Timestamp paidAt, String method, String reference) {
        var p = new HashMap<String, Object>();
        p.put("yid", paymentId.toString());
        p.put("method", method);
        p.put("reference", reference);
        p.put("paidAt", paidAt);
        return jdbc.update("""
                UPDATE payment SET status = 'paid', paid_at = :paidAt, method = :method, reference = :reference
                WHERE id = :yid::uuid""", p);
    }

    /** Stop chasing one pending row, with its note as given. */
    public int writeOff(UUID paymentId, String note) {
        var p = new HashMap<String, Object>();
        p.put("yid", paymentId.toString());
        p.put("note", note);
        return jdbc.update("""
                UPDATE payment SET status = 'write_off', written_off_at = now(), note = :note
                WHERE id = :yid::uuid""", p);
    }

    /** Write off a pending row in place, appending the reason to whatever note it has (capped at 500). */
    public int writeOffAppending(UUID paymentId, String note) {
        var p = new HashMap<String, Object>();
        p.put("yid", paymentId.toString());
        p.put("note", note);
        return jdbc.update("""
                UPDATE payment SET status = 'write_off', written_off_at = now(),
                       note = CASE WHEN CAST(:note AS text) IS NULL THEN note
                                   WHEN note IS NULL THEN :note
                                   ELSE left(note || ' · ' || :note, 500) END
                WHERE id = :yid::uuid""", p);
    }

    /** A correction: only the flagged columns are written. */
    public int patch(UUID paymentId, PaymentPatch c) {
        var p = new HashMap<String, Object>();
        p.put("yid", paymentId.toString());
        if (c.setAmount()) p.put("amount", c.amount());
        if (c.setMethod()) p.put("method", c.method());
        if (c.setReference()) p.put("reference", c.reference());
        if (c.setPaidAt()) p.put("paidAt", c.paidAt());
        if (c.setNote()) p.put("note", c.note());
        return jdbc.update("UPDATE payment SET " + String.join(", ", c.columns()) + " WHERE id = :yid::uuid", p);
    }

    public int softDelete(UUID paymentId) {
        return jdbc.update("UPDATE payment SET deleted_at = now() WHERE id = :yid::uuid AND deleted_at IS NULL",
                Map.of("yid", paymentId.toString()));
    }
}
