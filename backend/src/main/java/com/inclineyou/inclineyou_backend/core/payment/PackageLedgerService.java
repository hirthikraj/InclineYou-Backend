package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.payment.dto.Adjustment;
import com.inclineyou.inclineyou_backend.core.payment.dto.CurrentPackage;
import com.inclineyou.inclineyou_backend.core.payment.dto.Ledgered;
import com.inclineyou.inclineyou_backend.core.payment.dto.LockedPackage;
import com.inclineyou.inclineyou_backend.core.payment.dto.LockedPayment;
import com.inclineyou.inclineyou_backend.core.payment.dto.NewPayment;
import com.inclineyou.inclineyou_backend.core.payment.dto.PaymentPatch;
import com.inclineyou.inclineyou_backend.core.payment.dto.PaymentSums;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.util.Money;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
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

    private final PackageJdbcRepository packages;
    private final PaymentJdbcRepository payments;

    private static final Set<String> METHODS = Set.of("upi", "cash", "bank_transfer");
    private static final Set<String> KINDS = Set.of("pause", "resume", "extend", "sessions", "session", "due_date");

    /* ── the pack's life ───────────────────────────────────────────────────── */

    @Transactional
    public CurrentPackage pause(UUID tid, UUID pid, Map<String, Object> body) {
        var b = body(body, "reason", "effectiveAt");
        String reason = text(b.get("reason"), 200, "reason");
        Instant at = pastInstant(b.get("effectiveAt"), "effectiveAt");
        var k = lock(tid, pid);
        running(k);
        // Idempotent by target state: a paused pack stays paused, no second row.
        if (k.pausedAt() == null) {
            adjust(tid, k, "pause", 0, reason, at);
            log.info("package paused trainer={} package={}", tid, pid);
        }
        return packages.one(tid, pid).orElseThrow();
    }

    @Transactional
    public CurrentPackage resume(UUID tid, UUID pid, Map<String, Object> body) {
        var b = body(body, "effectiveAt");
        Instant at = pastInstant(b.get("effectiveAt"), "effectiveAt");
        var k = lock(tid, pid);
        running(k);
        if (k.pausedAt() != null) {
            if (at != null && at.isBefore(k.pausedAt().toInstant())) {
                throw ApiException.validation("effectiveAt: before the pause started");
            }
            // The trigger measures the days paused in the trainer's calendar and pushes end_date out.
            adjust(tid, k, "resume", 0, null, at);
            log.info("package resumed trainer={} package={}", tid, pid);
        }
        return packages.one(tid, pid).orElseThrow();
    }

    /** Not a state, so every call adds days; the confirm sheet guards the double tap. */
    @Transactional
    public CurrentPackage extend(UUID tid, UUID pid, Map<String, Object> body) {
        var b = body(body, "days", "reason");
        Integer days = whole(b.get("days"), 1, 3650, "days");
        if (days == null) throw ApiException.validation("days: required, 1 to 3650");
        String reason = text(b.get("reason"), 200, "reason");
        var k = lock(tid, pid);
        running(k);
        if (k.endDate() == null) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "PACKAGE_NO_END_DATE",
                    "This pack never expires, so there is nothing to extend.");
        }
        adjust(tid, k, "extend", days, reason, null);
        return packages.one(tid, pid).orElseThrow();
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
    public CurrentPackage cancel(UUID tid, UUID pid, Map<String, Object> body) {
        var b = body(body, "note");
        if (b.get("note") != null) throw ApiException.validation("note: not stored in v1 — send null or leave it out");
        var k = lock(tid, pid);
        String status = k.status();
        if ("cancelled".equals(status)) return packages.one(tid, pid).orElseThrow();
        if (!"active".equals(status)) {
            throw ApiException.conflict("PACKAGE_CLOSED", "This pack is already " + status + ".");
        }
        var sums = payments.sums(pid);
        if (due(k, sums).signum() > 0 || sums.pending().signum() > 0) {
            throw ApiException.conflict("PACKAGE_HAS_DUES",
                    "Money is still owed on this pack. Collect it or write it off first.");
        }
        packages.cancel(pid);
        log.info("package cancelled trainer={} package={}", tid, pid);
        return packages.one(tid, pid).orElseThrow();
    }

    /** Oldest first on idx_package_adjustment_package. Bounded: one pack's history. */
    public List<Adjustment> adjustments(UUID tid, UUID pid, String kind) {
        if (!packages.isMine(tid, pid)) throw ApiException.notFound("That package is not on your books.");
        List<String> kinds = null;
        if (kind != null && !kind.isBlank()) {
            kinds = new ArrayList<>();
            for (String s : kind.split(",")) {
                if (!KINDS.contains(s.strip())) throw ApiException.validation("kind: unknown value " + s.strip());
                kinds.add(s.strip());
            }
        }
        return packages.adjustments(pid, kinds);
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
        var sums = payments.sums(pid);
        BigDecimal room = due(k, sums);
        if ("pending".equals(status)) room = room.subtract(sums.pending());
        if (amount.compareTo(room) > 0) throw overDue(room.max(BigDecimal.ZERO));

        UUID made = id == null ? UUID.randomUUID() : id;
        Timestamp paid = "paid".equals(status) ? Timestamp.from(paidAt == null ? Instant.now() : paidAt) : null;
        // collected_by is stamped by stamp_payment_collector from the client's type; the value here is overwritten.
        int inserted = ledger(() -> payments.insertRecorded(new NewPayment(made, tid, pid, k.clientId(), amount,
                k.currency(), method, status, reference, paid, null, null, note)));
        if (inserted == 0) throw ApiException.idConflict();
        log.info("payment recorded trainer={} package={} status={}", tid, pid, status);
        return answer(tid, made, pid, true);
    }

    /** A3 — a pending payment landed. A retried tap on a paid row answers it as it is. */
    @Transactional
    public Ledgered markPaid(UUID tid, UUID yid, Map<String, Object> body) {
        var b = body(body, "method", "reference", "paidAt");
        String method = method(b.get("method"));
        String reference = text(b.get("reference"), 64, "reference");
        Instant paidAt = pastInstant(b.get("paidAt"), "paidAt");
        var y = lockPayment(tid, yid);
        UUID pid = y.packageId();
        var k = lock(tid, pid);
        String status = y.status();
        if ("paid".equals(status)) {
            boolean same = (method == null || method.equals(y.method()))
                    && (reference == null || reference.equals(y.reference()));
            if (same) return answer(tid, yid, pid, false);
            throw notPending("This payment is already paid differently. Edit it instead.");
        }
        if (!"pending".equals(status)) throw notPending("This payment was " + label(status) + ".");
        takesMoney(k);
        String m = method != null ? method : y.method();
        String r = reference != null ? reference : y.reference();
        collector(k, m, r);
        BigDecimal room = due(k, payments.sums(pid));
        if (y.amount().compareTo(room) > 0) throw overDue(room);
        Timestamp at = Timestamp.from(paidAt == null ? Instant.now() : paidAt);
        ledger(() -> payments.markPaid(yid, at, m, r));
        packages.touch(pid);
        return answer(tid, yid, pid, false);
    }

    /** A4 — stop chasing one pending row. The reason is appended to its note. */
    @Transactional
    public Ledgered writeOffPayment(UUID tid, UUID yid, Map<String, Object> body) {
        var b = body(body, "note");
        String reason = text(b.get("note"), 500, "note");
        var y = lockPayment(tid, yid);
        UUID pid = y.packageId();
        var k = lock(tid, pid);
        String status = y.status();
        if ("write_off".equals(status)) return answer(tid, yid, pid, false);
        if (!"pending".equals(status)) throw notPending("This payment was " + label(status) + ".");
        if ("refunded".equals(k.status())) throw closed(k);
        String note = appended(y.note(), reason);
        ledger(() -> payments.writeOff(yid, note));
        packages.touch(pid);
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
        var sums = payments.sums(pid);
        BigDecimal due = due(k, sums);
        if (due.signum() <= 0) throw ApiException.conflict("PACKAGE_NOTHING_DUE", "Nothing is owed on this pack.");

        BigDecimal rest;
        UUID answered = null;
        if (part == null) {
            for (UUID pendingId : payments.pendingIds(pid)) {
                ledger(() -> payments.writeOffAppending(pendingId, note));
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
            BigDecimal restAmount = rest;
            int inserted = ledger(() -> payments.insertWriteOff(new NewPayment(made, tid, pid, k.clientId(), restAmount,
                    k.currency(), null, "write_off", null, null, null, null, note)));
            if (inserted == 0) throw ApiException.idConflict();
            answered = made;
        }
        packages.touch(pid);
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
        if ("refunded".equals(k.status())) {
            throw ApiException.conflict("PACKAGE_ALREADY_REFUNDED", "This pack was already refunded.");
        }
        collector(k, method, reference);
        var sums = payments.sums(pid);
        if (sums.paid().compareTo(k.amount()) < 0 || sums.writtenOff().signum() > 0) {
            throw ApiException.conflict("PACKAGE_NOT_FULLY_PAID",
                    "Only a fully paid pack with nothing written off can be refunded.");
        }
        if (amount.compareTo(sums.paid()) > 0) {
            throw ApiException.conflict("REFUND_OVER_PAID", "That is more than was paid on this pack.");
        }
        UUID made = id == null ? UUID.randomUUID() : id;
        Timestamp when = Timestamp.from(at == null ? Instant.now() : at);
        int inserted = ledger(() -> payments.insertRefund(new NewPayment(made, tid, pid, k.clientId(), amount,
                k.currency(), method, "refund", reference, null, null, when, note)));
        if (inserted == 0) throw ApiException.idConflict();
        // The schema wants the refund row and the refunded status in one transaction.
        packages.markRefunded(pid);
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
        UUID pid = y.packageId();
        var k = lock(tid, pid);
        String status = y.status();
        if ("refund".equals(status)) throw frozen();
        if ("refunded".equals(k.status())) throw closed(k);
        checkVersion(ifMatch, String.valueOf(y.updatedAt().getTime()));
        Set<String> allowed = switch (status) {
            case "paid" -> Set.of("amount", "method", "reference", "paidAt", "note");
            case "pending" -> Set.of("amount", "method", "reference", "note");
            default -> Set.of("amount", "note");                       // write_off
        };
        for (String key : body.keySet()) {
            if (!allowed.contains(key)) throw ApiException.validation(key + ": not editable on a " + label(status) + " payment");
        }
        BigDecimal amount = null;
        if (body.containsKey("amount")) {
            amount = positive(body.get("amount"), "amount");
            var sums = payments.sums(pid);
            BigDecimal total = k.amount();
            BigDecimal old = y.amount();
            BigDecimal others = sums.paid().add(sums.writtenOff());
            if (!"pending".equals(status)) others = others.subtract(old);
            else others = others.add(sums.pending()).subtract(old);
            BigDecimal room = total.subtract(others);
            if (amount.compareTo(room) > 0) throw overDue(room.max(BigDecimal.ZERO));
        }
        String method = y.method();
        String reference = y.reference();
        if (body.containsKey("method")) method = method(body.get("method"));
        if (body.containsKey("reference")) reference = text(body.get("reference"), 64, "reference");
        if (!"write_off".equals(status)) collector(k, method, reference);
        Timestamp paidAt = null;
        if (body.containsKey("paidAt")) {
            Instant at = pastInstant(body.get("paidAt"), "paidAt");
            if (at == null) throw ApiException.validation("paidAt: a paid payment keeps its date");
            paidAt = Timestamp.from(at);
        }
        String note = null;
        if (body.containsKey("note")) note = text(body.get("note"), 500, "note");
        var change = new PaymentPatch(body.containsKey("amount"), amount, body.containsKey("method"), method,
                body.containsKey("reference"), reference, body.containsKey("paidAt"), paidAt,
                body.containsKey("note"), note);
        ledger(() -> payments.patch(yid, change));
        packages.touch(pid);
        return answer(tid, yid, pid, false);
    }

    /** A8 — recorded by mistake. Soft, and idempotent: a deleted payment answers 204 again. */
    @Transactional
    public void delete(UUID tid, UUID yid) {
        var ref = payments.ref(tid, yid).orElseThrow(() -> ApiException.notFound("That payment is not on your books."));
        if (ref.deletedAt() != null) return;
        UUID pid = ref.packageId();
        var k = lock(tid, pid);
        if ("refund".equals(ref.status())) throw frozen();
        if ("refunded".equals(k.status())) throw closed(k);
        ledger(() -> payments.softDelete(yid));
        packages.touch(pid);
        log.info("payment deleted trainer={} payment={}", tid, yid);
    }

    /* ── helpers ───────────────────────────────────────────────────────────── */

    private LockedPackage lock(UUID tid, UUID pid) {
        return packages.lock(tid, pid).orElseThrow(() -> ApiException.notFound("That package is not on your books."));
    }

    private LockedPayment lockPayment(UUID tid, UUID yid) {
        return payments.findLive(tid, yid).orElseThrow(() -> ApiException.notFound("That payment is not on your books."));
    }

    /** L5's rule: amount − paid − written off, never below zero. */
    private static BigDecimal due(LockedPackage k, PaymentSums s) {
        return k.amount().subtract(s.paid()).subtract(s.writtenOff()).max(BigDecimal.ZERO);
    }

    private static void running(LockedPackage k) {
        if (!"active".equals(k.status())) throw closed(k);
    }

    /** A cancelled or refunded pack takes no new money; a finished one can still be owed for. */
    private static void takesMoney(LockedPackage k) {
        if (Set.of("cancelled", "refunded").contains(k.status())) throw closed(k);
    }

    private static ApiException closed(LockedPackage k) {
        return ApiException.conflict("PACKAGE_CLOSED", "This pack is " + k.status() + ".");
    }

    /** payment_collector: the gym's desk takes no method; the trainer's needs one, and a reference only on UPI or bank. */
    private static void collector(LockedPackage k, String method, String reference) {
        if ("gym".equals(k.clientType())) {
            if (method != null || reference != null) {
                throw ApiException.validation("method: the gym collects for a gym client — send null");
            }
            return;
        }
        if (method == null) throw ApiException.validation("method: upi, cash or bank_transfer, required");
        if (reference != null && "cash".equals(method)) throw ApiException.validation("reference: only on upi or bank_transfer");
    }

    private void adjust(UUID tid, LockedPackage k, String kind, int days, String reason, Instant at) {
        packages.insertAdjustment(tid, k, kind, days, reason, Timestamp.from(at == null ? Instant.now() : at));
    }

    /** A replayed id: this trainer's row on this package answers 200; anywhere else is a clash. */
    private Ledgered replay(UUID tid, UUID id, UUID pid) {
        var mine = payments.belongsTo(tid, id, pid);
        if (mine.isEmpty()) return null;
        if (!mine.get()) throw ApiException.idConflict();
        return answer(tid, id, pid, false);
    }

    private Ledgered answer(UUID tid, UUID yid, UUID pid, boolean created) {
        return new Ledgered(payments.find(tid, yid).orElseThrow(ApiException::idConflict),
                packages.one(tid, pid).orElseThrow(), created);
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
                : "₹" + Money.format(room) + " is all that's owed on this pack.");
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
