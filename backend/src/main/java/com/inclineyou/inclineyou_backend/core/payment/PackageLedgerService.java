package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * api-contract 1.1 Client file A1–A11 — the writes a sold package's life and its
 * money book are made of: pause · resume · extend · cancel, and record · paid ·
 * write off (a payment, or a package) · refund · correct · delete.
 *
 * <p>Every write locks the package row first ({@code FOR UPDATE}), so two taps on
 * one pack are serial and the checks here read what the write will see. The
 * database holds the same rules as triggers ({@code apply_package_adjustment},
 * {@code check_package_ledger}, {@code freeze_refund}); they are the backstop,
 * and the checks here exist to answer a {@code code} rather than a 500. A trigger
 * that fires anyway is translated by {@link #ledger}.
 *
 * <p>A refunded package takes no payment write at all — record, edit, delete —
 * {@code 409 PACKAGE_CLOSED} (decided 28 Sep). {@code check_package_ledger} only
 * guards write-off and refund rows, so deleting a paid row after a refund would
 * otherwise leave more refunded than was ever paid.
 *
 * <p>Bodies are maps, as in the Clients writes: unknown keys are a 400, and a
 * PATCH tells an absent key from a null.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PackageLedgerService {

    private final NamedParameterJdbcTemplate jdbc;
    private final PackageReadService reads;

    private static final Set<String> METHODS = Set.of("upi", "cash", "bank_transfer");
    private static final Set<String> KINDS = Set.of("pause", "resume", "extend", "sessions", "session", "due_date");

    /** What a money write answers with: the row, and the package with its new sums. */
    public record Ledgered(PackageReadService.PaymentRow payment, PackageReadService.CurrentPackage pkg,
                           boolean created) {
        public Map<String, Object> body() {
            return Map.of("payment", payment, "package", pkg);
        }
    }

    public record Adjustment(String id, String kind, int days, int sessions, String sessionId, String reason,
                             long effectiveAt, String dueDate, String previousDueDate, Long reversedAt,
                             long createdAt) {}

    /* ── the pack's life ───────────────────────────────────────────────────── */

    @Transactional
    public PackageReadService.CurrentPackage pause(UUID tid, UUID pid, Map<String, Object> body) {
        var b = body(body, "reason", "effectiveAt");
        String reason = text(b.get("reason"), 200, "reason");
        Instant at = pastInstant(b.get("effectiveAt"), "effectiveAt");
        var k = lock(tid, pid);
        running(k);
        // Idempotent by target state: a paused pack stays paused, no second row.
        if (k.get("paused_at") == null) {
            adjust(tid, k, "pause", 0, reason, at);
            log.info("package paused trainer={} package={}", tid, pid);
        }
        return reads.one(tid, pid).orElseThrow();
    }

    @Transactional
    public PackageReadService.CurrentPackage resume(UUID tid, UUID pid, Map<String, Object> body) {
        var b = body(body, "effectiveAt");
        Instant at = pastInstant(b.get("effectiveAt"), "effectiveAt");
        var k = lock(tid, pid);
        running(k);
        if (k.get("paused_at") instanceof Timestamp paused) {
            if (at != null && at.isBefore(paused.toInstant())) {
                throw ApiException.validation("effectiveAt: before the pause started");
            }
            // The trigger measures the days paused in the trainer's calendar and pushes end_date out.
            adjust(tid, k, "resume", 0, null, at);
            log.info("package resumed trainer={} package={}", tid, pid);
        }
        return reads.one(tid, pid).orElseThrow();
    }

    /** Not a state, so every call adds days; the confirm sheet guards the double tap. */
    @Transactional
    public PackageReadService.CurrentPackage extend(UUID tid, UUID pid, Map<String, Object> body) {
        var b = body(body, "days", "reason");
        Integer days = whole(b.get("days"), 1, 3650, "days");
        if (days == null) throw ApiException.validation("days: required, 1 to 3650");
        String reason = text(b.get("reason"), 200, "reason");
        var k = lock(tid, pid);
        running(k);
        if (k.get("end_date") == null) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "PACKAGE_NO_END_DATE",
                    "This pack never expires, so there is nothing to extend.");
        }
        adjust(tid, k, "extend", days, reason, null);
        return reads.one(tid, pid).orElseThrow();
    }

    /**
     * End one deal early (R74): the rule archive uses to close a pack — nothing
     * owed and nothing pending. Sessions left are simply no longer charged.
     *
     * <p>{@code note} is accepted only as null: the contract keeps it "on the
     * closing adjustment's reason", but {@code package_adjustment_kind} has no
     * closing kind, so there is nowhere to keep it, and a note taken and dropped
     * is worse than one refused.
     */
    @Transactional
    public PackageReadService.CurrentPackage cancel(UUID tid, UUID pid, Map<String, Object> body) {
        var b = body(body, "note");
        if (b.get("note") != null) throw ApiException.validation("note: not stored in v1 — send null or leave it out");
        var k = lock(tid, pid);
        String status = (String) k.get("status");
        if ("cancelled".equals(status)) return reads.one(tid, pid).orElseThrow();
        if (!"active".equals(status)) {
            throw ApiException.conflict("PACKAGE_CLOSED", "This pack is already " + status + ".");
        }
        var sums = sums(pid);
        if (due(k, sums).signum() > 0 || sums.pending().signum() > 0) {
            throw ApiException.conflict("PACKAGE_HAS_DUES",
                    "Money is still owed on this pack. Collect it or write it off first.");
        }
        jdbc.update("UPDATE package SET status = 'cancelled', closed_at = now() WHERE id = :pid::uuid",
                Map.of("pid", pid.toString()));
        log.info("package cancelled trainer={} package={}", tid, pid);
        return reads.one(tid, pid).orElseThrow();
    }

    /** Oldest first on idx_package_adjustment_package. Bounded: one pack's history. */
    public List<Adjustment> adjustments(UUID tid, UUID pid, String kind) {
        var p = new HashMap<String, Object>();
        p.put("tid", tid.toString());
        p.put("pid", pid.toString());
        Boolean mine = jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM package WHERE id = :pid::uuid AND trainer_id = :tid::uuid
                               AND deleted_at IS NULL)""", p, Boolean.class);
        if (!Boolean.TRUE.equals(mine)) throw ApiException.notFound("That package is not on your books.");
        String byKind = "";
        if (kind != null && !kind.isBlank()) {
            var kinds = new ArrayList<String>();
            for (String s : kind.split(",")) {
                if (!KINDS.contains(s.strip())) throw ApiException.validation("kind: unknown value " + s.strip());
                kinds.add(s.strip());
            }
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

    /* ── money ─────────────────────────────────────────────────────────────── */

    /** A2 — received now ({@code paid}) or expected ({@code pending}). collectedBy is the database's. */
    @Transactional
    public Ledgered record(UUID tid, UUID pid, Map<String, Object> body) {
        var b = body(body, "id", "amount", "method", "reference", "status", "paidAt", "note");
        UUID id = uuid(b.get("id"), "id");
        BigDecimal amount = positive(b.get("amount"), "amount");
        String status = b.get("status") == null ? "paid" : String.valueOf(b.get("status"));
        if (!Set.of("paid", "pending").contains(status)) throw ApiException.validation("status: paid or pending");
        Instant paidAt = pastInstant(b.get("paidAt"), "paidAt");
        if (paidAt != null && !"paid".equals(status)) throw ApiException.validation("paidAt: only on a paid payment");
        String method = method(b.get("method"));
        String reference = text(b.get("reference"), 64, "reference");
        String note = text(b.get("note"), 500, "note");

        var k = lock(tid, pid);
        if (id != null) {
            var replay = replay(tid, id, pid);
            if (replay != null) return replay;
        }
        takesMoney(k);
        collector(k, method, reference);
        var sums = sums(pid);
        BigDecimal room = due(k, sums);
        if ("pending".equals(status)) room = room.subtract(sums.pending());
        if (amount.compareTo(room) > 0) throw overDue(room.max(BigDecimal.ZERO));

        var p = new HashMap<String, Object>();
        p.put("id", (id == null ? UUID.randomUUID() : id).toString());
        p.put("tid", tid.toString());
        p.put("pid", pid.toString());
        p.put("cid", k.get("client_id").toString());
        p.put("amount", amount);
        p.put("currency", k.get("currency"));
        p.put("method", method);
        p.put("status", status);
        p.put("reference", reference);
        p.put("paidAt", "paid".equals(status) ? Timestamp.from(paidAt == null ? Instant.now() : paidAt) : null);
        p.put("note", note);
        // collected_by is stamped by stamp_payment_collector from the client's type; the value here is overwritten.
        int inserted = ledger(() -> jdbc.update("""
                INSERT INTO payment (id, trainer_id, client_id, package_id, amount, currency, collected_by,
                                     method, status, reference, paid_at, note)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, :pid::uuid, :amount, :currency, 'trainer',
                        :method, :status, :reference, :paidAt, :note)
                ON CONFLICT (id) DO NOTHING
                """, p));
        if (inserted == 0) throw ApiException.idConflict();
        log.info("payment recorded trainer={} package={} status={}", tid, pid, status);
        return answer(tid, UUID.fromString((String) p.get("id")), pid, true);
    }

    /** A3 — a pending payment landed. A retried tap on a paid row answers it as it is. */
    @Transactional
    public Ledgered markPaid(UUID tid, UUID yid, Map<String, Object> body) {
        var b = body(body, "method", "reference", "paidAt");
        String method = method(b.get("method"));
        String reference = text(b.get("reference"), 64, "reference");
        Instant paidAt = pastInstant(b.get("paidAt"), "paidAt");
        var y = lockPayment(tid, yid);
        UUID pid = (UUID) y.get("package_id");
        var k = lock(tid, pid);
        String status = (String) y.get("status");
        if ("paid".equals(status)) {
            boolean same = (method == null || method.equals(y.get("method")))
                    && (reference == null || reference.equals(y.get("reference")));
            if (same) return answer(tid, yid, pid, false);
            throw notPending("This payment is already paid differently. Edit it instead.");
        }
        if (!"pending".equals(status)) throw notPending("This payment was " + label(status) + ".");
        takesMoney(k);
        String m = method != null ? method : (String) y.get("method");
        String r = reference != null ? reference : (String) y.get("reference");
        collector(k, m, r);
        BigDecimal room = due(k, sums(pid));
        if (((BigDecimal) y.get("amount")).compareTo(room) > 0) throw overDue(room);
        var p = new HashMap<String, Object>();
        p.put("yid", yid.toString());
        p.put("method", m);
        p.put("reference", r);
        p.put("paidAt", Timestamp.from(paidAt == null ? Instant.now() : paidAt));
        ledger(() -> jdbc.update("""
                UPDATE payment SET status = 'paid', paid_at = :paidAt, method = :method, reference = :reference
                WHERE id = :yid::uuid""", p));
        touch(pid);
        return answer(tid, yid, pid, false);
    }

    /** A4 — stop chasing one pending row. The reason is appended to its note. */
    @Transactional
    public Ledgered writeOffPayment(UUID tid, UUID yid, Map<String, Object> body) {
        var b = body(body, "note");
        String reason = text(b.get("note"), 500, "note");
        var y = lockPayment(tid, yid);
        UUID pid = (UUID) y.get("package_id");
        var k = lock(tid, pid);
        String status = (String) y.get("status");
        if ("write_off".equals(status)) return answer(tid, yid, pid, false);
        if (!"pending".equals(status)) throw notPending("This payment was " + label(status) + ".");
        if ("refunded".equals(k.get("status"))) throw closed(k);
        var p = new HashMap<String, Object>();
        p.put("yid", yid.toString());
        p.put("note", appended((String) y.get("note"), reason));
        ledger(() -> jdbc.update("""
                UPDATE payment SET status = 'write_off', written_off_at = now(), note = :note
                WHERE id = :yid::uuid""", p));
        touch(pid);
        return answer(tid, yid, pid, false);
    }

    /**
     * A5 — forgive what is still owed on a package. {@code amount: null} is all
     * of it: every pending row is written off in place (it was the same money,
     * expected), and one write_off row covers what is left, if anything.
     *
     * <p>When the pending rows already covered everything, no row is inserted and
     * the answer names the last row written off; a retry of that call then finds
     * nothing due (409 PACKAGE_NOTHING_DUE) rather than a replay, because there
     * is no row carrying its id.
     */
    @Transactional
    public Ledgered writeOffPackage(UUID tid, UUID pid, Map<String, Object> body) {
        var b = body(body, "id", "amount", "note");
        UUID id = uuid(b.get("id"), "id");
        BigDecimal part = b.get("amount") == null ? null : positive(b.get("amount"), "amount");
        String note = text(b.get("note"), 500, "note");
        var k = lock(tid, pid);
        if (id != null) {
            var replay = replay(tid, id, pid);
            if (replay != null) return replay;
        }
        takesMoney(k);
        var sums = sums(pid);
        BigDecimal due = due(k, sums);
        if (due.signum() <= 0) throw ApiException.conflict("PACKAGE_NOTHING_DUE", "Nothing is owed on this pack.");

        var p = new HashMap<String, Object>();
        p.put("tid", tid.toString());
        p.put("pid", pid.toString());
        p.put("cid", k.get("client_id").toString());
        p.put("currency", k.get("currency"));
        p.put("note", note);
        BigDecimal rest;
        UUID answered = null;
        if (part == null) {
            var pending = jdbc.queryForList("""
                    SELECT id FROM payment WHERE package_id = :pid::uuid AND status = 'pending' AND deleted_at IS NULL
                    ORDER BY created_at, id""", p, UUID.class);
            for (UUID pendingId : pending) {
                var q = new HashMap<String, Object>(p);
                q.put("yid", pendingId.toString());
                ledger(() -> jdbc.update("""
                        UPDATE payment SET status = 'write_off', written_off_at = now(),
                               note = CASE WHEN CAST(:note AS text) IS NULL THEN note
                                           WHEN note IS NULL THEN :note
                                           ELSE left(note || ' · ' || :note, 500) END
                        WHERE id = :yid::uuid""", q));
                answered = pendingId;
            }
            rest = due.subtract(sums.pending());
        } else {
            BigDecimal room = due.subtract(sums.pending());
            if (part.compareTo(room) > 0) throw overDue(room.max(BigDecimal.ZERO));
            rest = part;
        }
        if (rest.signum() > 0) {
            UUID made = id == null ? UUID.randomUUID() : id;
            p.put("id", made.toString());
            p.put("amount", rest);
            int inserted = ledger(() -> jdbc.update("""
                    INSERT INTO payment (id, trainer_id, client_id, package_id, amount, currency, collected_by,
                                         status, written_off_at, note)
                    VALUES (:id::uuid, :tid::uuid, :cid::uuid, :pid::uuid, :amount, :currency, 'trainer',
                            'write_off', now(), :note)
                    ON CONFLICT (id) DO NOTHING""", p));
            if (inserted == 0) throw ApiException.idConflict();
            answered = made;
        }
        touch(pid);
        log.info("package written off trainer={} package={} all={}", tid, pid, part == null);
        return answer(tid, answered, pid, true);
    }

    /** A6 — money back on a fully paid pack, which closes it for good. */
    @Transactional
    public Ledgered refund(UUID tid, UUID pid, Map<String, Object> body) {
        var b = body(body, "id", "amount", "method", "reference", "refundedAt", "note");
        UUID id = uuid(b.get("id"), "id");
        BigDecimal amount = positive(b.get("amount"), "amount");
        String method = method(b.get("method"));
        String reference = text(b.get("reference"), 64, "reference");
        Instant at = pastInstant(b.get("refundedAt"), "refundedAt");
        String note = text(b.get("note"), 500, "note");
        var k = lock(tid, pid);
        if (id != null) {
            var replay = replay(tid, id, pid);
            if (replay != null) return replay;
        }
        if ("refunded".equals(k.get("status"))) {
            throw ApiException.conflict("PACKAGE_ALREADY_REFUNDED", "This pack was already refunded.");
        }
        collector(k, method, reference);
        var sums = sums(pid);
        if (sums.paid().compareTo((BigDecimal) k.get("amount")) < 0 || sums.writtenOff().signum() > 0) {
            throw ApiException.conflict("PACKAGE_NOT_FULLY_PAID",
                    "Only a fully paid pack with nothing written off can be refunded.");
        }
        if (amount.compareTo(sums.paid()) > 0) {
            throw ApiException.conflict("REFUND_OVER_PAID", "That is more than was paid on this pack.");
        }
        var p = new HashMap<String, Object>();
        UUID made = id == null ? UUID.randomUUID() : id;
        p.put("id", made.toString());
        p.put("tid", tid.toString());
        p.put("pid", pid.toString());
        p.put("cid", k.get("client_id").toString());
        p.put("amount", amount);
        p.put("currency", k.get("currency"));
        p.put("method", method);
        p.put("reference", reference);
        p.put("at", Timestamp.from(at == null ? Instant.now() : at));
        p.put("note", note);
        int inserted = ledger(() -> jdbc.update("""
                INSERT INTO payment (id, trainer_id, client_id, package_id, amount, currency, collected_by,
                                     method, status, reference, refunded_at, note)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, :pid::uuid, :amount, :currency, 'trainer',
                        :method, 'refund', :reference, :at, :note)
                ON CONFLICT (id) DO NOTHING""", p));
        if (inserted == 0) throw ApiException.idConflict();
        // The schema wants the refund row and the refunded status in one transaction.
        jdbc.update("UPDATE package SET status = 'refunded', closed_at = coalesce(closed_at, now()) WHERE id = :pid::uuid", p);
        log.info("package refunded trainer={} package={}", tid, pid);
        return answer(tid, made, pid, true);
    }

    /** A7 — correct a payment typed wrong. Which fields depends on the row's status. */
    @Transactional
    public Ledgered patch(UUID tid, UUID yid, String ifMatch, Map<String, Object> body) {
        if (body == null || body.isEmpty()) throw ApiException.validation("body: send at least one field");
        for (String key : body.keySet()) {
            if (Set.of("status", "collectedBy", "packageId").contains(key)) {
                throw ApiException.validation(key + ": never editable — delete the payment and record it again");
            }
            if (!Set.of("amount", "method", "reference", "paidAt", "note").contains(key)) {
                throw ApiException.validation(key + ": not a field this route takes");
            }
        }
        var y = lockPayment(tid, yid);
        UUID pid = (UUID) y.get("package_id");
        var k = lock(tid, pid);
        String status = (String) y.get("status");
        if ("refund".equals(status)) throw frozen();
        if ("refunded".equals(k.get("status"))) throw closed(k);
        checkVersion(ifMatch, String.valueOf(((Timestamp) y.get("updated_at")).getTime()));
        Set<String> allowed = switch (status) {
            case "paid" -> Set.of("amount", "method", "reference", "paidAt", "note");
            case "pending" -> Set.of("amount", "method", "reference", "note");
            default -> Set.of("amount", "note");                       // write_off
        };
        for (String key : body.keySet()) {
            if (!allowed.contains(key)) throw ApiException.validation(key + ": not editable on a " + label(status) + " payment");
        }
        var p = new HashMap<String, Object>();
        p.put("yid", yid.toString());
        var sets = new ArrayList<String>();
        BigDecimal amount = (BigDecimal) y.get("amount");
        if (body.containsKey("amount")) {
            amount = positive(body.get("amount"), "amount");
            var sums = sums(pid);
            BigDecimal total = (BigDecimal) k.get("amount");
            BigDecimal old = (BigDecimal) y.get("amount");
            BigDecimal others = sums.paid().add(sums.writtenOff());
            if (!"pending".equals(status)) others = others.subtract(old);
            else others = others.add(sums.pending()).subtract(old);
            BigDecimal room = total.subtract(others);
            if (amount.compareTo(room) > 0) throw overDue(room.max(BigDecimal.ZERO));
            p.put("amount", amount);
            sets.add("amount = :amount");
        }
        String method = (String) y.get("method");
        String reference = (String) y.get("reference");
        if (body.containsKey("method")) { method = method(body.get("method")); sets.add("method = :method"); }
        if (body.containsKey("reference")) { reference = text(body.get("reference"), 64, "reference"); sets.add("reference = :reference"); }
        if (!"write_off".equals(status)) collector(k, method, reference);
        p.put("method", method);
        p.put("reference", reference);
        if (body.containsKey("paidAt")) {
            Instant at = pastInstant(body.get("paidAt"), "paidAt");
            if (at == null) throw ApiException.validation("paidAt: a paid payment keeps its date");
            p.put("paidAt", Timestamp.from(at));
            sets.add("paid_at = :paidAt");
        }
        if (body.containsKey("note")) { p.put("note", text(body.get("note"), 500, "note")); sets.add("note = :note"); }
        ledger(() -> jdbc.update("UPDATE payment SET " + String.join(", ", sets) + " WHERE id = :yid::uuid", p));
        touch(pid);
        return answer(tid, yid, pid, false);
    }

    /** A8 — recorded by mistake. Soft, and idempotent: a deleted payment answers 204 again. */
    @Transactional
    public void delete(UUID tid, UUID yid) {
        var rows = jdbc.queryForList("""
                SELECT package_id, status, deleted_at FROM payment WHERE id = :yid::uuid AND trainer_id = :tid::uuid
                """, Map.of("yid", yid.toString(), "tid", tid.toString()));
        if (rows.isEmpty()) throw ApiException.notFound("That payment is not on your books.");
        if (rows.getFirst().get("deleted_at") != null) return;
        UUID pid = (UUID) rows.getFirst().get("package_id");
        var k = lock(tid, pid);
        if ("refund".equals(rows.getFirst().get("status"))) throw frozen();
        if ("refunded".equals(k.get("status"))) throw closed(k);
        ledger(() -> jdbc.update("UPDATE payment SET deleted_at = now() WHERE id = :yid::uuid AND deleted_at IS NULL",
                Map.of("yid", yid.toString())));
        touch(pid);
        log.info("payment deleted trainer={} payment={}", tid, yid);
    }

    /* ── helpers ───────────────────────────────────────────────────────────── */

    private record Sums(BigDecimal paid, BigDecimal writtenOff, BigDecimal pending) {}

    private Map<String, Object> lock(UUID tid, UUID pid) {
        var rows = jdbc.queryForList("""
                SELECT k.id, k.client_id, k.status, k.amount, k.currency, k.paused_at, k.end_date, c.client_type
                FROM package k JOIN client c ON c.id = k.client_id
                WHERE k.id = :pid::uuid AND k.trainer_id = :tid::uuid AND k.deleted_at IS NULL
                FOR UPDATE OF k""", Map.of("pid", pid.toString(), "tid", tid.toString()));
        if (rows.isEmpty()) throw ApiException.notFound("That package is not on your books.");
        return rows.getFirst();
    }

    private Map<String, Object> lockPayment(UUID tid, UUID yid) {
        var rows = jdbc.queryForList("""
                SELECT package_id, status, amount, method, reference, note, updated_at FROM payment
                WHERE id = :yid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL""",
                Map.of("yid", yid.toString(), "tid", tid.toString()));
        if (rows.isEmpty()) throw ApiException.notFound("That payment is not on your books.");
        return rows.getFirst();
    }

    private Sums sums(UUID pid) {
        return jdbc.queryForObject("""
                SELECT coalesce(sum(amount) FILTER (WHERE status = 'paid'), 0) AS paid,
                       coalesce(sum(amount) FILTER (WHERE status = 'write_off'), 0) AS written_off,
                       coalesce(sum(amount) FILTER (WHERE status = 'pending'), 0) AS pending
                FROM payment WHERE package_id = :pid::uuid AND deleted_at IS NULL""",
                Map.of("pid", pid.toString()), (rs, i) -> new Sums(
                        rs.getBigDecimal("paid"), rs.getBigDecimal("written_off"), rs.getBigDecimal("pending")));
    }

    /** L5's rule: amount − paid − written off, never below zero. */
    private static BigDecimal due(Map<String, Object> k, Sums s) {
        return ((BigDecimal) k.get("amount")).subtract(s.paid()).subtract(s.writtenOff()).max(BigDecimal.ZERO);
    }

    private static void running(Map<String, Object> k) {
        if (!"active".equals(k.get("status"))) throw closed(k);
    }

    /** A cancelled or refunded pack takes no new money; a finished one can still be owed for. */
    private static void takesMoney(Map<String, Object> k) {
        if (Set.of("cancelled", "refunded").contains(k.get("status"))) throw closed(k);
    }

    private static ApiException closed(Map<String, Object> k) {
        return ApiException.conflict("PACKAGE_CLOSED", "This pack is " + k.get("status") + ".");
    }

    /** payment_collector: the gym's desk takes no method; the trainer's needs one, and a reference only on UPI or bank. */
    private static void collector(Map<String, Object> k, String method, String reference) {
        if ("gym".equals(k.get("client_type"))) {
            if (method != null || reference != null) {
                throw ApiException.validation("method: the gym collects for a gym client — send null");
            }
            return;
        }
        if (method == null) throw ApiException.validation("method: upi, cash or bank_transfer, required");
        if (reference != null && "cash".equals(method)) throw ApiException.validation("reference: only on upi or bank_transfer");
    }

    private void adjust(UUID tid, Map<String, Object> k, String kind, int days, String reason, Instant at) {
        var p = new HashMap<String, Object>();
        p.put("tid", tid.toString());
        p.put("pid", k.get("id").toString());
        p.put("cid", k.get("client_id").toString());
        p.put("kind", kind);
        p.put("days", days);
        p.put("reason", reason);
        p.put("at", Timestamp.from(at == null ? Instant.now() : at));
        // apply_package_adjustment applies it to the package, under the same row lock.
        jdbc.update("""
                INSERT INTO package_adjustment (trainer_id, package_id, client_id, kind, days, reason, effective_at)
                VALUES (:tid::uuid, :pid::uuid, :cid::uuid, :kind, :days, :reason, :at)""", p);
    }

    /** A child-row write moves its parent's version (Conventions · Concurrency). */
    private void touch(UUID pid) {
        jdbc.update("UPDATE package SET updated_at = now() WHERE id = :pid::uuid", Map.of("pid", pid.toString()));
    }

    /** A replayed id: this trainer's row on this package answers 200; anywhere else is a clash. */
    private Ledgered replay(UUID tid, UUID id, UUID pid) {
        var rows = jdbc.queryForList("""
                SELECT (trainer_id = :tid::uuid AND package_id = :pid::uuid) AS mine FROM payment WHERE id = :id::uuid
                """, Map.of("tid", tid.toString(), "pid", pid.toString(), "id", id.toString()));
        if (rows.isEmpty()) return null;
        if (!Boolean.TRUE.equals(rows.getFirst().get("mine"))) throw ApiException.idConflict();
        return answer(tid, id, pid, false);
    }

    private Ledgered answer(UUID tid, UUID yid, UUID pid, boolean created) {
        return new Ledgered(reads.payment(tid, yid).orElseThrow(ApiException::idConflict),
                reads.one(tid, pid).orElseThrow(), created);
    }

    /**
     * The triggers are the backstop. When one fires anyway, its sentence names
     * the rule; the answer is the code for it, never a 500.
     */
    private static <T> T ledger(Supplier<T> write) {
        try {
            return write.get();
        } catch (DataIntegrityViolationException e) {
            String m = String.valueOf(e.getMostSpecificCause().getMessage());
            if (m.contains("uq_payment_reference")) {
                throw ApiException.conflict("PAYMENT_REFERENCE_TAKEN", "That reference is already recorded.");
            }
            if (m.contains("uq_payment_one_refund")) {
                throw ApiException.conflict("PACKAGE_ALREADY_REFUNDED", "This pack was already refunded.");
            }
            if (m.contains("payment_pkey")) throw ApiException.idConflict();
            if (m.contains("exceeds what is still due")) throw overDue(null);
            if (m.contains("not fully paid")) {
                throw ApiException.conflict("PACKAGE_NOT_FULLY_PAID", "Only a fully paid pack can be refunded.");
            }
            if (m.contains("exceeds what was paid")) {
                throw ApiException.conflict("REFUND_OVER_PAID", "That is more than was paid on this pack.");
            }
            if (m.contains("is a refund")) throw frozen();
            if (m.contains("payment_collector")) throw ApiException.validation("method: does not fit who collects");
            throw e;
        }
    }

    private static ApiException overDue(BigDecimal room) {
        return ApiException.conflict("PAYMENT_OVER_DUE", room == null
                ? "That is more than is owed on this pack."
                : "₹" + PackageReadService.money(room) + " is all that's owed on this pack.");
    }

    private static ApiException notPending(String message) {
        return ApiException.conflict("PAYMENT_NOT_PENDING", message);
    }

    private static ApiException frozen() {
        return ApiException.conflict("PAYMENT_FROZEN", "A refund can't be changed or undone.");
    }

    private static String label(String status) {
        return switch (status) {
            case "write_off" -> "written off";
            case "refund" -> "a refund";
            default -> status;
        };
    }

    private static String appended(String note, String reason) {
        if (reason == null) return note;
        String out = note == null ? reason : note + " · " + reason;
        if (out.length() > 500) throw ApiException.validation("note: the note and the reason come to more than 500 characters");
        return out;
    }

    static void checkVersion(String ifMatch, String version) {
        if (ifMatch == null || ifMatch.isBlank() || "*".equals(ifMatch.strip())) return;
        String want = ifMatch.strip().replaceFirst("^W/", "").replace("\"", "");
        if (!want.equals(version)) {
            throw new ApiException(HttpStatus.PRECONDITION_FAILED, "PRECONDITION_FAILED",
                    "This payment changed since you opened it.");
        }
    }

    private static Map<String, Object> body(Map<String, Object> body, String... keys) {
        Map<String, Object> b = body == null ? Map.of() : body;
        var allowed = Set.of(keys);
        for (String key : b.keySet()) {
            if (!allowed.contains(key)) throw ApiException.validation(key + ": not a field this route takes");
        }
        return b;
    }

    private static String text(Object raw, int max, String field) {
        if (raw == null) return null;
        if (!(raw instanceof String s)) throw ApiException.validation(field + ": text or null");
        String v = s.strip();
        if (v.isEmpty()) return null;
        if (v.length() > max) throw ApiException.validation(field + ": at most " + max + " characters");
        return v;
    }

    private static String method(Object raw) {
        if (raw == null) return null;
        if (!(raw instanceof String s) || !METHODS.contains(s)) {
            throw ApiException.validation("method: upi, cash or bank_transfer");
        }
        return s;
    }

    /** Money is a decimal string on the wire; a bare number is accepted too. More than zero. */
    private static BigDecimal positive(Object raw, String field) {
        if (raw == null) throw ApiException.validation(field + ": required");
        try {
            BigDecimal v = new BigDecimal(String.valueOf(raw).strip());
            if (v.signum() <= 0 || v.scale() > 2 || v.compareTo(new BigDecimal("99999999.99")) > 0) {
                throw new NumberFormatException();
            }
            return v;
        } catch (NumberFormatException e) {
            throw ApiException.validation(field + ": a decimal amount above zero, like \"4000.00\"");
        }
    }

    /** An instant is epoch ms. Back-datable, never in the future (a minute of clock skew allowed). */
    private static Instant pastInstant(Object raw, String field) {
        if (raw == null) return null;
        if (!(raw instanceof Number n) || n.doubleValue() != n.longValue()) {
            throw ApiException.validation(field + ": epoch milliseconds");
        }
        Instant at = Instant.ofEpochMilli(n.longValue());
        if (at.isAfter(Instant.now().plusSeconds(60))) throw ApiException.validation(field + ": in the future");
        return at;
    }

    private static Integer whole(Object raw, int min, int max, String field) {
        if (raw == null) return null;
        if (!(raw instanceof Number n) || n.doubleValue() != n.intValue() || n.intValue() < min || n.intValue() > max) {
            throw ApiException.validation(field + ": a whole number between " + min + " and " + max);
        }
        return n.intValue();
    }

    private static UUID uuid(Object raw, String field) {
        if (raw == null) return null;
        try {
            return UUID.fromString(String.valueOf(raw).strip());
        } catch (IllegalArgumentException e) {
            throw ApiException.validation(field + ": not an id");
        }
    }
}
