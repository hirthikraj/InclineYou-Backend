package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.payment.dto.Ledgered;
import com.inclineyou.inclineyou_backend.core.payment.dto.PaymentClaim;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * The trainer's side of "I've paid" (V50; api-contract 1.2, pc-l1…pc-l4): the To confirm queue, and the two decisions.
 *
 * <p><b>Confirm records an ordinary payment through {@link PackageLedgerService#record}</b> — the one way money enters the
 * book, with its pack lock, its over-due and pending-room checks and its trigger translation — and only then marks the claim
 * confirmed. What the client said is the default for every field; the trainer may change the amount (₹2,500 arrived, not
 * ₹3,000), the method (it was cash after all), the UTR (optional on both sides) and the pack. A claim made before any pack was
 * sold has none: the trainer sells one first and names it here ({@code CLAIM_NEEDS_PACKAGE} otherwise).
 *
 * <p>A gym client's claim ({@code collector = gym}) becomes a gym-collected payment — no method, no reference, because the
 * money is at the gym's desk; the UTR the client gave stays on the claim.
 *
 * <p>Undo: of a decline, {@code reopen}; of a confirm, the money book's own Undo (deleting the payment), which puts the claim
 * back to open ({@link PaymentClaimJdbcRepository#reopenForPayment}).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PaymentClaimService {

    private static final Set<String> STATUSES = Set.of("open", "confirmed", "declined", "withdrawn");
    private static final Set<String> CONFIRM_KEYS = Set.of("packageId", "amount", "method", "reference", "paidAt", "note");

    private final PaymentClaimJdbcRepository claims;
    private final PackageLedgerService ledger;
    private final WorkspaceClock clock;

    public record Confirmed(PaymentClaim claim, Ledgered ledgered) {
        public Map<String, Object> body() {
            return Map.of("claim", claim, "payment", ledgered.payment(), "package", ledgered.pkg());
        }
    }

    public List<PaymentClaim> list(UUID tid, String status, UUID clientId, Integer limit) {
        String st = status == null ? "open" : status;
        if (!STATUSES.contains(st)) throw ApiException.validation("status: open, confirmed, declined or withdrawn");
        int n = limit == null ? 50 : limit;
        if (n < 1 || n > 100) throw ApiException.validation("limit: 1 to 100");
        return claims.list(tid, st, clientId, n);
    }

    @Transactional
    public Confirmed confirm(UUID tid, UUID id, Map<String, Object> raw) {
        Map<String, Object> body = raw == null ? Map.of() : raw;
        for (String key : body.keySet()) {
            if (!CONFIRM_KEYS.contains(key)) throw ApiException.validation(key + ": not a field this route takes");
        }
        var c = claims.lock(tid, id).orElseThrow(() -> ApiException.notFound("That payment report is not on your books."));
        if ("confirmed".equals(c.status())) {
            // A retried tap: answer what the first one did.
            return new Confirmed(c, ledger.answerFor(tid, UUID.fromString(c.paymentId()), UUID.fromString(c.packageId())));
        }
        if (!"open".equals(c.status())) throw decided(c);

        UUID pid = body.containsKey("packageId") ? uuid(body.get("packageId"), "packageId")
                : c.packageId() == null ? null : UUID.fromString(c.packageId());
        if (pid == null) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "CLAIM_NEEDS_PACKAGE",
                    "This was paid before a pack was sold. Sell the pack it pays for, then confirm.");
        }
        UUID owner = claims.clientOfPackage(tid, pid).orElseThrow(() -> ApiException.notFound("That package is not on your books."));
        if (!owner.toString().equals(c.clientId())) throw ApiException.validation("packageId: a pack of " + c.clientName() + "'s");

        boolean gym = "gym".equals(c.collector());
        var record = new HashMap<String, Object>();
        record.put("status", "paid");
        record.put("amount", body.containsKey("amount") ? body.get("amount") : new java.math.BigDecimal(c.amount()));
        if (!gym) {
            String method = body.containsKey("method") ? (String) str(body.get("method"), "method") : "upi";
            record.put("method", method);
            Object ref = body.containsKey("reference") ? body.get("reference") : ("cash".equals(method) ? null : c.reference());
            record.put("reference", ref);
        } else if (body.get("method") != null || body.get("reference") != null) {
            throw ApiException.validation("method: the gym collects for a gym client — send null");
        }
        record.put("paidAt", body.containsKey("paidAt") ? body.get("paidAt") : paidAt(c.paidOn()));
        record.put("note", body.containsKey("note") ? body.get("note") : c.note());

        Ledgered done = ledger.record(tid, pid, record);
        UUID yid = UUID.fromString(done.payment().id());
        if (claims.confirm(id, pid, yid) == 0) throw decided(c);
        log.info("payment claim confirmed trainer={} claim={} payment={}", tid, id, yid);
        return new Confirmed(claims.find(tid, id).orElseThrow(), done);
    }

    @Transactional
    public PaymentClaim decline(UUID tid, UUID id, Map<String, Object> raw) {
        Map<String, Object> body = raw == null ? Map.of() : raw;
        for (String key : body.keySet()) {
            if (!"reason".equals(key)) throw ApiException.validation(key + ": not a field this route takes");
        }
        String reason = (String) str(body.get("reason"), "reason");
        if (reason != null && reason.length() > 280) throw ApiException.validation("reason: at most 280 characters");
        var c = claims.lock(tid, id).orElseThrow(() -> ApiException.notFound("That payment report is not on your books."));
        if ("declined".equals(c.status())) return c;
        if (!"open".equals(c.status())) throw decided(c);
        claims.decline(id, reason);
        log.info("payment claim declined trainer={} claim={}", tid, id);
        return claims.find(tid, id).orElseThrow();
    }

    /** Undo of a decline. An open claim answers as it is; a confirmed one is undone by deleting its payment. */
    @Transactional
    public PaymentClaim reopen(UUID tid, UUID id) {
        var c = claims.lock(tid, id).orElseThrow(() -> ApiException.notFound("That payment report is not on your books."));
        if ("open".equals(c.status())) return c;
        if (!"declined".equals(c.status())) {
            throw ApiException.conflict("CLAIM_DECIDED", "confirmed".equals(c.status())
                    ? "This one is confirmed. Undo the payment instead."
                    : "The client took this one back.");
        }
        claims.reopen(id);
        return claims.find(tid, id).orElseThrow();
    }

    /**
     * The day the client says they paid, as a moment in the book: now if it is today, else midday on that day in the
     * workspace's zone — a payment made "yesterday" books on yesterday, not at the stroke of midnight before it.
     */
    private Long paidAt(String paidOn) {
        ZoneId zone = clock.zone();
        LocalDate day = LocalDate.parse(paidOn);
        if (!day.isBefore(WorkspaceClock.today(zone))) return null;
        return WorkspaceClock.startOf(day, zone).plus(Duration.ofHours(12)).toEpochMilli();
    }

    private static ApiException decided(PaymentClaim c) {
        return ApiException.conflict("CLAIM_DECIDED", switch (c.status()) {
            case "confirmed" -> "This payment is already confirmed.";
            case "declined" -> "You already marked this as not received.";
            default -> "The client took this one back.";
        });
    }

    private static UUID uuid(Object raw, String field) {
        if (raw == null) return null;
        try {
            return UUID.fromString(String.valueOf(raw));
        } catch (IllegalArgumentException e) {
            throw ApiException.validation(field + ": a UUID");
        }
    }

    private static Object str(Object raw, String field) {
        if (raw == null) return null;
        if (!(raw instanceof String s)) throw ApiException.validation(field + ": text");
        String t = s.strip();
        return t.isEmpty() ? null : t;
    }
}
