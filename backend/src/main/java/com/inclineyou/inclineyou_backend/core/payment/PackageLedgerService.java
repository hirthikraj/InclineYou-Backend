package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.payment.dto.Adjustment;
import com.inclineyou.inclineyou_backend.core.payment.dto.CurrentPackage;
import com.inclineyou.inclineyou_backend.core.payment.dto.Ledgered;
import com.inclineyou.inclineyou_backend.core.payment.dto.LockedPackage;
import com.inclineyou.inclineyou_backend.core.payment.dto.LockedPayment;
import com.inclineyou.inclineyou_backend.core.payment.dto.NewPayment;
import com.inclineyou.inclineyou_backend.core.payment.dto.PaymentPatch;
import com.inclineyou.inclineyou_backend.core.payment.dto.PaymentSums;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.util.DateWindow;
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
import java.time.LocalDate;
import java.time.ZoneId;
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
    private final WorkspaceClock clock;

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
        clocked(k);
        // Idempotent by target state: a paused pack stays paused, no second row.
        if (k.pausedAt() == null) {
            pauseStart(k, at);
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
        clocked(k);
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

    /** Not a state, so every call adds days — unless it carries an {@code id} already used (18 Nov 2026): a retry answers as it is. */
    @Transactional
    public CurrentPackage extend(UUID tid, UUID pid, Map<String, Object> body) {
        var b = body(body, "id", "days", "reason");
        UUID id = uuid(b.get("id"), "id");
        Integer days = whole(b.get("days"), 1, 3650, "days");
        if (days == null) throw ApiException.validation("days: required, 1 to 3650");
        String reason = text(b.get("reason"), 200, "reason");
        var k = lock(tid, pid);
        // A retried extend (its answer lost on a gym-floor connection) answers the pack as it is instead of giving the
        // days twice (18 Nov 2026). The id is the adjustment's, minted when the form opens; under the row lock, so two
        // racing copies cannot both miss it.
        if (id != null) {
            var seen = packages.adjustmentKind(id);
            if (seen.isPresent()) {
                if (!seen.get().equals(pid + "|extend")) throw ApiException.idConflict();
                return packages.one(tid, pid).orElseThrow();
            }
        }
        running(k);
        clocked(k);
        if (k.endDate() == null) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "PACKAGE_NO_END_DATE",
                    "This pack never expires, so there is nothing to extend.");
        }
        try {
            packages.insertAdjustment(id, tid, k, "extend", days, reason, Timestamp.from(Instant.now()));
        } catch (org.springframework.dao.DuplicateKeyException e) {
            // An id another workspace used: row-level security hid it from the lookup above. Nothing to recover in
            // this transaction, so it ends here.
            throw ApiException.idConflict();
        }
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
        // A single session's own sale is cancelled through its session (19 Nov 2026): cancelled here, the session stayed
        // booked as single and Mark done revived the sale (the reopen rule) and charged it, so the cancel undid itself.
        if (k.singleSale()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "PACKAGE_SINGLE_SESSION",
                    "This is one session's own sale. Undo or cancel the session instead.");
        }
        String status = k.status();
        if ("cancelled".equals(status)) return packages.one(tid, pid).orElseThrow();
        if (!"active".equals(status)) {
            throw ApiException.conflict("PACKAGE_CLOSED", "This pack is already " + status + ".");
        }
        var sums = payments.sums(pid);
        // Pending first, with its own way out (19 Nov 2026): on a fully paid pack a pending row cannot be written off
        // (check_package_ledger), only deleted, so "collect it or write it off" named a dead end.
        if (sums.pending().signum() > 0) {
            throw ApiException.conflict("PACKAGE_HAS_DUES",
                    "A payment on this pack is still pending. Mark it paid, write it off or delete it first.");
        }
        if (due(k, sums).signum() > 0) {
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
        Instant paidAt = paidAt(b.get("paidAt"));
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
        // Money that lands must leave room for the money still expected (19 Nov 2026). A paid payment used to be bounded
        // by what is owed alone, so ₹9,000 in cash on a ₹9,000 pack went through beside a pending ₹500 UPI request —
        // which then could never be marked paid or written off (more than is owed), only deleted.
        if ("paid".equals(status)) pendingRoom(room, sums.pending(), amount);

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
        Instant paidAt = paidAt(b.get("paidAt"));
        var locked = lockPayment(tid, yid);
        var y = locked.payment();
        var k = locked.pkg();
        UUID pid = y.packageId();
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
        var sums = payments.sums(pid);
        BigDecimal room = due(k, sums);
        if (y.amount().compareTo(room) > 0) throw overDue(room);
        // The same for the pending payments other than this one (19 Nov 2026): landing this one must not strand them.
        pendingRoom(room, sums.pending().subtract(y.amount()), y.amount());
        Timestamp at = Timestamp.from(paidAt == null ? Instant.now() : paidAt);
        if (ledger(() -> payments.markPaid(yid, at, m, r)) == 0) throw notPending("This payment is no longer pending.");
        packages.touch(pid);
        return answer(tid, yid, pid, false);
    }

    /** A4 — stop chasing one pending row. The reason is appended to its note. */
    @Transactional
    public Ledgered writeOffPayment(UUID tid, UUID yid, Map<String, Object> body) {
        var b = body(body, "note");
        String reason = text(b.get("note"), 500, "note");
        var locked = lockPayment(tid, yid);
        var y = locked.payment();
        var k = locked.pkg();
        UUID pid = y.packageId();
        String status = y.status();
        if ("write_off".equals(status)) return answer(tid, yid, pid, false);
        if (!"pending".equals(status)) throw notPending("This payment was " + label(status) + ".");
        if ("refunded".equals(k.status())) throw closed(k);
        String note = appended(y.note(), reason);
        if (ledger(() -> payments.writeOff(yid, note)) == 0) throw notPending("This payment is no longer pending.");
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
        if (due.signum() <= 0) {
            // A retried "write off everything" (19 Nov 2026). When all that was owed was already pending, the pending
            // rows are written off in place and no row carries the request's id, so the id cannot replay. Judged by
            // its end state instead, as pause is: nothing owed and the pack's latest change a write-off is that same
            // request again, answered 200, not "Nothing is owed" for a write-off that went through.
            if (id != null && part == null) {
                var last = payments.latestChange(pid);
                if (last.isPresent() && "write_off".equals(last.get().status())) {
                    return answer(tid, last.get().id(), pid, false);
                }
            }
            throw ApiException.conflict("PACKAGE_NOTHING_DUE", "Nothing is owed on this pack.");
        }

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
        Instant at = withinWindow(b.get("refundedAt"), "refundedAt");
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
        // A pending payment would be stranded: a refunded pack takes no money and is closed to write-offs and deletes,
        // so it stayed on the money to chase for good (19 Nov 2026). A pack can be fully paid with one pending, because
        // recording a paid payment does not count pending ones against the room — and then the pending one can no longer
        // be marked paid or written off either (check_package_ledger), only deleted, which is why the sentence names it.
        if (sums.pending().signum() > 0) {
            throw ApiException.conflict("PACKAGE_HAS_DUES",
                    "A payment on this pack is still pending. Mark it paid, write it off or delete it first.");
        }
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
        var locked = lockPayment(tid, yid);
        var y = locked.payment();
        var k = locked.pkg();
        UUID pid = y.packageId();
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
            // Everything else on the pack — paid, written off AND pending — whatever this row's status (19 Nov 2026). A
            // paid or written-off row used to leave the pending ones out, so correcting ₹8,500 up to ₹9,000 beside a
            // pending ₹500 stranded the ₹500, as recording used to (pendingRoom).
            BigDecimal others = sums.paid().add(sums.writtenOff()).add(sums.pending()).subtract(old);
            BigDecimal room = total.subtract(others);
            if (amount.compareTo(room) > 0) {
                BigDecimal otherPending = "pending".equals(status) ? sums.pending().subtract(old) : sums.pending();
                if (otherPending.signum() > 0) pendingRoom(room.add(otherPending), otherPending, amount);
                throw overDue(room.max(BigDecimal.ZERO));
            }
        }
        String method = y.method();
        String reference = y.reference();
        if (body.containsKey("method")) method = method(body.get("method"));
        if (body.containsKey("reference")) reference = text(body.get("reference"), 64, "reference");
        if (!"write_off".equals(status)) collector(k, method, reference);
        Timestamp paidAt = null;
        if (body.containsKey("paidAt")) {
            Instant at = paidAt(body.get("paidAt"));
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

    /**
     * The payment, read AFTER its pack's row lock — the lock every money write takes (18 Nov 2026). It used to be read
     * first, so a write-off committed by another tab in between left this route holding "pending": mark-paid then set
     * status paid on a written-off row (refused by payment_state_shape, a 500), and PATCH checked If-Match against a
     * version that was already gone. A payment never changes pack, so the first read only finds which pack to lock.
     */
    private Locked lockPayment(UUID tid, UUID yid) {
        var first = payments.findLive(tid, yid).orElseThrow(() -> ApiException.notFound("That payment is not on your books."));
        var k = lock(tid, first.packageId());
        var y = payments.findLive(tid, yid).orElseThrow(() -> ApiException.notFound("That payment is not on your books."));
        return new Locked(y, k);
    }

    private record Locked(LockedPayment payment, LockedPackage pkg) {}

    /** L5's rule: amount − paid − written off, never below zero. */
    private static BigDecimal due(LockedPackage k, PaymentSums s) {
        return k.amount().subtract(s.paid()).subtract(s.writtenOff()).max(BigDecimal.ZERO);
    }

    private static void running(LockedPackage k) {
        if (!"active".equals(k.status())) throw closed(k);
    }

    /**
     * Pause, resume and extend move a pack's clock, and a single session's own sale has none (18 Nov 2026): it is due on
     * its session's day. A paused sale was skipped at Mark done ("not charged, PACKAGE_EMPTY") while its price stayed
     * owed, so the session and the money book disagreed. The client pause already leaves single sales alone.
     */
    private static void clocked(LockedPackage k) {
        if (k.singleSale()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "PACKAGE_SINGLE_SESSION",
                    "This is one session's own sale. Move or cancel the session instead.");
        }
    }

    /**
     * A pause starts no earlier than the pack did, and at most {@link DateWindow#MONTHS} months back, on the workspace's
     * calendar (18 Nov 2026). Any past moment was taken: a year-old start resumed today pushed the end date out by 365
     * days, and one before the start paused time the pack never ran.
     */
    private void pauseStart(LockedPackage k, Instant at) {
        if (at == null) return;
        ZoneId zone = clock.zone();
        LocalDate day = at.atZone(zone).toLocalDate();
        DateWindow.check(day, WorkspaceClock.today(zone), "effectiveAt");
        if (k.startDate() != null && day.isBefore(k.startDate().toLocalDate())) {
            throw ApiException.validation("effectiveAt: before the pack started (" + k.startDate() + ")");
        }
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

    /**
     * Refuses landing {@code amount} when it would leave less owed than the {@code pending} payments still expected:
     * those could then never be marked paid or written off, only deleted. Names what can be recorded instead.
     */
    private static void pendingRoom(BigDecimal room, BigDecimal pending, BigDecimal amount) {
        if (pending.signum() <= 0 || amount.compareTo(room.subtract(pending)) <= 0) return;
        BigDecimal free = room.subtract(pending).max(BigDecimal.ZERO);
        throw ApiException.conflict("PAYMENT_OVER_DUE", "₹" + Money.format(pending) + " of this pack is a pending payment. "
                + (free.signum() > 0 ? "Record up to ₹" + Money.format(free) + ", or mark" : "Mark")
                + " the pending one paid or delete it first.");
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
    /**
     * When money landed: not in the future, and at most {@link DateWindow#MONTHS} months back on the workspace calendar
     * (18 Nov 2026). Any past moment was taken, so a typo like 2016 for 2026 filed a payment ten years back — out of this
     * month's collections and into a GST period long closed, while the pack still read it as paid.
     */
    private Instant paidAt(Object raw) {
        return withinWindow(raw, "paidAt");
    }

    /** {@link #paidAt}'s rule for any moment money moved — a refund's {@code refundedAt} too (19 Nov 2026). */
    private Instant withinWindow(Object raw, String field) {
        Instant at = pastInstant(raw, field);
        if (at == null) return null;
        ZoneId zone = clock.zone();
        DateWindow.check(at.atZone(zone).toLocalDate(), WorkspaceClock.today(zone), field);
        return at;
    }

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
