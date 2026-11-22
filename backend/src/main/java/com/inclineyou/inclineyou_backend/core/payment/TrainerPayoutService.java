package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.payment.dto.Payout;
import com.inclineyou.inclineyou_backend.core.payment.dto.PayoutCreated;
import com.inclineyou.inclineyou_backend.core.payment.dto.PayoutFilter;
import com.inclineyou.inclineyou_backend.core.payment.dto.PayoutPage;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.wire.Cursor;
import com.inclineyou.inclineyou_backend.shared.wire.IfMatch;
import com.inclineyou.inclineyou_backend.shared.wire.Page;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static com.inclineyou.inclineyou_backend.core.payment.GymInput.*;

/**
 * {@code /v1/trainer-payouts} — what the gym has actually paid the trainer.
 * The balance is a sum over these rows and nothing stores it, so editing or
 * deleting a payout moves the balance at once.
 */
@Service
@RequiredArgsConstructor
public class TrainerPayoutService {

    private final TrainerPayoutJdbcRepository payouts;
    private final WorkspaceClock clock;
    private final GymArrangementService arrangements;

    public PayoutPage list(UUID tid, String gymName, String from, String to, Integer limit, String cursor) {
        // An explicit gymName is a name filter. Otherwise it is the running terms' gym — by place when
        // it was picked from the search (a rename cannot split it), by name when it is free text.
        var running = arrangements.running(tid).orElse(null);
        String byName = null, byPlace = null;
        if (gymName != null && !gymName.isBlank()) {
            byName = gymName.strip();
        } else if (running != null && running.gymPlaceId() != null) {
            byPlace = running.gymPlaceId();
        } else if (running != null) {
            byName = running.gymName();
        }
        var zone = clock.zone();
        LocalDate f = WorkspaceClock.parseDate(from, "from");
        LocalDate t = WorkspaceClock.parseDate(to, "to");
        int n = Cursor.limit(limit, 50, 200);
        Cursor after = Cursor.decode(cursor);
        var filter = new PayoutFilter(byName, byPlace, f == null ? null : WorkspaceClock.startOf(f, zone),
                t == null ? null : WorkspaceClock.startOf(t, zone), after, n);
        var rows = payouts.page(tid, filter);
        var page = Page.of(rows, n, r -> Cursor.encode(r.cursorKey(), r.id()));
        return new PayoutPage(clock.currency(), page.items(), page.nextCursor());
    }

    @Transactional
    public PayoutCreated create(UUID tid, Map<String, Object> raw) {
        var b = body(raw, "id", "amount", "method", "reference", "receivedAt", "note");
        UUID id = uuid(b.get("id"), "id");
        BigDecimal amount = amount(b.get("amount"), "amount", true);
        String method = payoutMethod(b.get("method"));
        String reference = text(b.get("reference"), 64, "reference");
        String note = text(b.get("note"), 500, "note");
        Instant at = b.get("receivedAt") == null ? Instant.now() : pastInstant(b.get("receivedAt"), "receivedAt", clock.zone());
        if (id != null) {
            var existing = payouts.find(tid, id);
            if (existing.isPresent()) return new PayoutCreated(existing.get(), false);
        }
        var run = arrangements.running(tid).orElseThrow(() -> ApiException.conflict("ARRANGEMENT_REQUIRED",
                "Record your pay terms with the gym first."));

        UUID newId = id == null ? UUID.randomUUID() : id;
        int n = payouts.insert(newId, tid, run.gymName(), run.gymPlaceId(), amount, clock.currency(), method,
                reference, note, Timestamp.from(at));
        if (n == 0) {
            // A double tap (20 Nov 2026): the first request's row was not visible to the id check above, and the insert
            // waited for it and skipped. It has committed by now, so a fresh read finds it: a replay, not a 409. An id
            // that is another trainer's (or a deleted one) is still not found here, and is the conflict.
            return payouts.find(tid, newId).map(p -> new PayoutCreated(p, false)).orElseThrow(ApiException::idConflict);
        }
        return new PayoutCreated(payouts.find(tid, newId).orElseThrow(), true);
    }

    @Transactional
    public Payout patch(UUID tid, UUID id, String ifMatch, Map<String, Object> raw) {
        var b = body(raw, "amount", "method", "reference", "receivedAt", "note");
        // Locked before If-Match is checked (20 Nov 2026): on a plain read two tabs that opened the same version both
        // passed, and the second correction replaced the first without a word.
        var cur = payouts.findForUpdate(tid, id).orElseThrow(() -> ApiException.notFound("That payout does not exist."));
        IfMatch.check(ifMatch, cur.version(), "This payout changed since you opened it.");
        if (b.isEmpty()) return cur;
        BigDecimal amount = b.containsKey("amount") ? amount(b.get("amount"), "amount", true) : new BigDecimal(cur.amount());
        String method = b.containsKey("method") ? payoutMethod(b.get("method")) : cur.method();
        String reference = b.containsKey("reference") ? text(b.get("reference"), 64, "reference") : cur.reference();
        String note = b.containsKey("note") ? text(b.get("note"), 500, "note") : cur.note();
        Instant at = b.containsKey("receivedAt") ? pastInstant(b.get("receivedAt"), "receivedAt", clock.zone())
                : Instant.ofEpochMilli(cur.receivedAt());
        // Nothing changed: answer the row and write nothing (20 Nov 2026), so the version moves only on a real change.
        if (amount.compareTo(new BigDecimal(cur.amount())) == 0 && java.util.Objects.equals(method, cur.method())
                && java.util.Objects.equals(reference, cur.reference()) && java.util.Objects.equals(note, cur.note())
                && at.toEpochMilli() == cur.receivedAt()) {
            return cur;
        }
        payouts.update(id, tid, amount, method, reference, note, Timestamp.from(at));
        return payouts.find(tid, id).orElseThrow();
    }

    /** Soft, for a payout typed wrong; idempotent. */
    @Transactional
    public void delete(UUID tid, UUID id) {
        payouts.softDelete(tid, id);
    }

    Optional<Payout> find(UUID tid, UUID id) {
        return payouts.find(tid, id);
    }
}
