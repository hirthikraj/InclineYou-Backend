package com.inclineyou.inclineyou_backend.payment;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.inclineyou.inclineyou_backend.exception.ApiException;
import com.inclineyou.inclineyou_backend.tenant.CurrentScope;
import com.inclineyou.inclineyou_backend.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.wire.Cursor;
import com.inclineyou.inclineyou_backend.wire.Page;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * {@code GET /v1/packages?scope=current} — api-contract Today L5.
 *
 * <p>The packs that matter today, with what has been paid and what is still owed
 * computed HERE. Owing is what let the old screen's {@code GET /v1/payments} read
 * every payment ever; with {@code amountDue} on the package, the payments read can
 * be a seven-day activity window.
 *
 * <p>Read through RLS, which scopes {@code package} and {@code payment} to the
 * active workspace alone — the money book never spans workspaces, unlike the diary.
 */
@Service
@RequiredArgsConstructor
public class PackageReadService {

    private final NamedParameterJdbcTemplate jdbc;
    private final WorkspaceClock clock;

    public record CurrentPackage(
            String id,
            String clientId,
            String packId,
            String name,
            String service,
            String basis,
            Integer sessionsTotal,
            Integer sessionsRemaining,
            String amount,
            String discountAmount,
            String currency,
            String startDate,
            String endDate,
            String dueDate,
            String status,
            Long pausedAt,
            int pausedDays,
            String trainerSharePercent,
            String trainerShareAmount,
            String amountPaid,
            /** Σ refund rows — 1.1. */
            String amountRefunded,
            String amountDue,
            long createdAt
    ) {}

    /**
     * What each package still owes: {@code amount} less what was paid and what
     * was written off, never below zero. {@code amount} is already net — the
     * schema's {@code discount_amount} only records why it is below the list
     * price — so the discount is NOT subtracted again (the 1.0 draft did, and
     * under-reported every discounted pack). A cancelled or refunded package owes
     * nothing — the sale was undone, and chasing it would be chasing money nobody
     * agreed to pay.
     *
     * <p>All three sums come off idx_payment_package (package_id) INCLUDE
     * (amount, status), index-only, in one grouped pass.
     *
     * <p>Shared with the money summary so "pending" there and "owed" on a pack can
     * never be two different sums.
     */
    static final String LEDGER_CTE = """
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
                   amount_due, created_at
            """;

    /**
     * {@code GET /v1/packages} — api-contract Today L5 and Client file L1.
     *
     * <p>{@code scope=current} is three sets, unioned: every live pack; every
     * pack with money still owed whatever its status (a finished pack can still
     * be owed for); and each client's newest pack even if closed, because the
     * per-session rate and Renew both need the last agreed terms. Without a scope,
     * {@code clientId} gives every package that client bought. The shape is the
     * same either way — {@code scope} picks rows, never the shape.
     *
     * <p>Status is kept current by writes, not by this read: the charge that
     * empties a pack closes it, and the nightly job closes the expired ones.
     * Reads never write. Bounded, so no cursor; newest first, then id.
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
                p, PackageReadService::row);
    }

    /** The gym's and the trainer's part of a gym-desk payment, from {@code payment_trainer_share}. */
    public record Split(String gym, String trainer) {}

    public record PaymentRow(
            String id,
            String clientId,
            String packageId,
            String clientName,
            String packageName,
            String amount,
            String currency,
            String collectedBy,
            String method,
            String status,
            String reference,
            String note,
            Long paidAt,
            Long writtenOffAt,
            Long refundedAt,
            /** The instant the row counts on — paidAt · writtenOffAt · refundedAt · createdAt (pending). The order. */
            long bookAt,
            Split split,
            long createdAt,
            String version,
            /** bookAt at full precision, for the cursor only — never on the wire. */
            @JsonIgnore String cursorKey
    ) {}

    /** {@code total} only with {@code includeTotal=true}. */
    public record Ledger(String currency, List<PaymentRow> items, String nextCursor,
                         @JsonInclude(JsonInclude.Include.NON_NULL) Integer total) {}

    private static final Set<String> PAYMENT_STATUSES = Set.of("pending", "paid", "write_off", "refund");
    private static final Set<String> METHODS = Set.of("upi", "cash", "bank_transfer");
    private static final Set<String> COLLECTORS = Set.of("trainer", "gym");
    private static final Set<String> CLIENT_TYPES = Set.of("independent", "gym");

    /** The instant a payment row counts on. R85's {@code payment.book_at} column will replace this expression. */
    private static final String BOOK_AT = """
            (CASE y.status WHEN 'paid' THEN y.paid_at WHEN 'write_off' THEN y.written_off_at
                           WHEN 'refund' THEN y.refunded_at ELSE y.created_at END)""";

    public record LedgerQuery(String status, String from, String to, String method, String clientId,
                              String packageId, String collectedBy, String clientType,
                              Integer limit, String cursor, boolean includeTotal) {}

    /**
     * {@code GET /v1/payments} — api-contract Business L2, which Today L7 is the
     * same endpoint of. {@code from}/{@code to} are dates in the workspace
     * timezone on {@code bookAt}, {@code to} exclusive; Today asks for paid rows
     * in the last seven days, twenty of them.
     *
     * <p>Keyset-paged on (bookAt, id) descending, 50 a page, at most 200. The 1.0
     * endpoint cut the list at 500 rows without saying so; nothing is cut now —
     * a non-null {@code nextCursor} says there is more. Names and the split are
     * joined for the page only, so the join costs a page, not the book.
     *
     * <p>Until R85's {@code payment.book_at} and {@code idx_payment_ledger} land
     * (V2), {@code bookAt} is computed from the status, and a status-filtered
     * page leans on the per-status indexes ({@code idx_payment_book} for paid).
     */
    public Ledger payments(UUID trainerId, LedgerQuery q) {
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        var where = new ArrayList<String>(List.of("y.trainer_id = :tid::uuid", "y.deleted_at IS NULL"));

        inList(q.status(), "status", PAYMENT_STATUSES, "y.status", "statuses", p, where);
        inList(q.method(), "method", METHODS, "y.method", "methods", p, where);
        inList(q.collectedBy(), "collectedBy", COLLECTORS, "y.collected_by", "collectors", p, where);
        inList(q.clientType(), "clientType", CLIENT_TYPES, "c.client_type", "clientTypes", p, where);
        if (q.clientId() != null && !q.clientId().isBlank()) {
            p.put("cid", uuid(q.clientId(), "clientId").toString());
            where.add("y.client_id = :cid::uuid");
        }
        if (q.packageId() != null && !q.packageId().isBlank()) {
            p.put("pid", uuid(q.packageId(), "packageId").toString());
            where.add("y.package_id = :pid::uuid");
        }
        LocalDate fromDate = WorkspaceClock.parseDate(q.from(), "from");
        LocalDate toDate = WorkspaceClock.parseDate(q.to(), "to");
        if (fromDate != null || toDate != null) {
            var zone = clock.zone();
            if (fromDate != null) {
                p.put("from", Timestamp.from(WorkspaceClock.startOf(fromDate, zone)));
                where.add(BOOK_AT + " >= :from");
            }
            if (toDate != null) {
                p.put("to", Timestamp.from(WorkspaceClock.startOf(toDate, zone)));
                where.add(BOOK_AT + " < :to");
            }
        }
        String filtered = String.join(" AND ", where);

        int n = Cursor.limit(q.limit(), 50, 200);
        var page = new ArrayList<>(where);
        Cursor after = Cursor.decode(q.cursor());
        if (after != null) {
            p.put("afterAt", after.keyAsTimestamp());
            p.put("afterId", after.id().toString());
            page.add("(" + BOOK_AT + ", y.id) < (:afterAt, :afterId::uuid)");
        }
        p.put("limit", n + 1);

        var rows = jdbc.query("""
                SELECT y.id::text AS id, y.client_id::text AS client_id, y.package_id::text AS package_id,
                       c.name AS client_name, k.name AS package_name,
                       y.amount, y.currency, y.collected_by, y.method, y.status, y.reference, y.note,
                       y.paid_at, y.written_off_at, y.refunded_at, y.created_at, y.updated_at,
                       %s AS book_at, sh.share
                FROM payment y
                JOIN client c ON c.id = y.client_id
                JOIN package k ON k.id = y.package_id
                LEFT JOIN payment_trainer_share sh ON sh.payment_id = y.id
                WHERE %s
                ORDER BY book_at DESC, y.id DESC
                LIMIT :limit
                """.formatted(BOOK_AT, String.join(" AND ", page)), p, (rs, i) -> {
            BigDecimal amount = rs.getBigDecimal("amount");
            BigDecimal share = rs.getBigDecimal("share");
            // Negative on a refund in the view; the split names parts of THIS
            // row's amount, so it is shown as magnitudes.
            Split split = share == null ? null
                    : new Split(money(amount.subtract(share.abs())), money(share.abs()));
            long updated = rs.getTimestamp("updated_at").getTime();
            return new PaymentRow(
                    rs.getString("id"),
                    rs.getString("client_id"),
                    rs.getString("package_id"),
                    rs.getString("client_name"),
                    rs.getString("package_name"),
                    money(amount),
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
                    String.valueOf(updated),
                    Cursor.key(rs.getTimestamp("book_at")));
        });
        var out = Page.of(rows, n, r -> Cursor.encode(r.cursorKey(), r.id()));

        Integer total = !q.includeTotal() ? null : jdbc.queryForObject(
                "SELECT count(*) FROM payment y JOIN client c ON c.id = y.client_id WHERE " + filtered,
                p, Integer.class);
        return new Ledger(workspaceCurrency(), out.items(), out.nextCursor(), total);
    }

    /** Every money response says its currency; an aggregate carries the workspace's. */
    String workspaceCurrency() {
        return jdbc.queryForObject("SELECT currency FROM tenant WHERE id = :id::uuid",
                Map.of("id", CurrentScope.require().activeTenantId().toString()), String.class);
    }

    private static void inList(String raw, String param, Set<String> allowed, String column, String key,
                               Map<String, Object> p, List<String> where) {
        if (raw == null || raw.isBlank()) return;
        var wanted = new ArrayList<String>();
        for (String s : raw.split(",")) {
            String v = s.strip();
            if (!allowed.contains(v)) throw ApiException.validation(param + ": unknown value " + v);
            if (!wanted.contains(v)) wanted.add(v);
        }
        p.put(key, wanted);
        where.add(column + " IN (:" + key + ")");
    }

    private static UUID uuid(String raw, String param) {
        try {
            return UUID.fromString(raw.strip());
        } catch (IllegalArgumentException e) {
            throw ApiException.validation(param + ": not an id");
        }
    }

    private static Long epochOrNull(Timestamp ts) {
        return ts == null ? null : ts.getTime();
    }

    /** One package in the L5 shape — what a write that creates one answers with. Empty if not this trainer's. */
    public Optional<CurrentPackage> one(UUID trainerId, UUID packageId) {
        return jdbc.query("WITH " + LEDGER_CTE + COLUMNS + """
                FROM ledger WHERE id = :pid::uuid
                """, Map.of("tid", trainerId.toString(), "pid", packageId.toString()), PackageReadService::row)
                .stream().findFirst();
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
                money(rs.getBigDecimal("amount")),
                money(rs.getBigDecimal("discount_amount")),
                rs.getString("currency"),
                rs.getString("start_date"),
                rs.getString("end_date"),
                rs.getString("due_date"),
                rs.getString("status"),
                paused == null ? null : paused.getTime(),
                rs.getInt("paused_days"),
                money(rs.getBigDecimal("trainer_share_percent")),
                money(rs.getBigDecimal("trainer_share_amount")),
                money(rs.getBigDecimal("amount_paid")),
                money(rs.getBigDecimal("amount_refunded")),
                money(rs.getBigDecimal("amount_due")),
                rs.getTimestamp("created_at").getTime());
    }

    /** Money is a decimal string on the wire, never a float. Null stays null. */
    static String money(BigDecimal v) {
        return v == null ? null : v.setScale(2, RoundingMode.HALF_UP).toPlainString();
    }

    private static Integer intOrNull(ResultSet rs, String column) throws SQLException {
        int v = rs.getInt(column);
        return rs.wasNull() ? null : v;
    }
}
