package com.inclineyou.inclineyou_backend.core.portal;

import com.inclineyou.inclineyou_backend.core.payment.PackageJdbcRepository;
import com.inclineyou.inclineyou_backend.core.payment.PaymentClaimJdbcRepository;
import com.inclineyou.inclineyou_backend.core.payment.dto.PaymentClaim;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import com.inclineyou.inclineyou_backend.core.portal.dto.PortalMoney;
import com.inclineyou.inclineyou_backend.shared.wire.Cursor;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.UUID;

/**
 * The client's package and what they owe and have paid (api-contract 1.2, pm-l1 and pm-l2). The money book is the trainer's wedge and this is the
 * one door onto it from a client: their own figures, read-only, behind a switch the trainer owns ({@code client_can_see_money}).
 *
 * <p>Sessions left never disappears with the Payments tab — the package read is the balance function's, which does not depend on the switch —
 * but a price, an amount, a payment and the ledger are all behind it. What is owed is the trainer's own ledger sum, not a second one.
 */
@Service
@RequiredArgsConstructor
public class PortalMoneyService {

    private final PortalMoneyJdbcRepository repo;
    private final PackageJdbcRepository packages;
    private final PaymentClaimJdbcRepository claims;
    private final PortalAccess access;

    public PortalMoney.Package pack(String phone) {
        UUID client = access.clientId(phone);
        PortalMoney.Pack active = null;
        var past = new ArrayList<PortalMoney.Past>();
        for (JsonNode n : repo.balances(client)) {
            String status = n.path("status").asString();
            Integer total = n.path("sessions_total").isNumber() ? n.path("sessions_total").asInt() : null;
            Integer left = n.path("sessions_left").isNumber() ? n.path("sessions_left").asInt() : null;
            if ("active".equals(status) && active == null) {
                active = new PortalMoney.Pack(n.path("id").asString(), n.path("name").asString(), status, total, total == null || left == null ? null : total - left, left,
                        date(n, "starts_on"), date(n, "ends_on"), n.path("paused").asBoolean(false));
            } else if (!"active".equals(status)) {
                String ended = n.path("closed_at").isString() ? n.path("closed_at").asString().substring(0, 10) : date(n, "ends_on");
                past.add(new PortalMoney.Past(n.path("id").asString(), n.path("name").asString(), status, total, date(n, "starts_on"), ended));
            }
        }
        return new PortalMoney.Package(active, past, repo.moneyVisible(client) ? repo.history(client) : null);
    }

    public PortalMoney.Money money(String phone, int limit, String rawCursor) {
        UUID client = access.clientId(phone);
        if (!repo.moneyVisible(client)) return new PortalMoney.Money(false, null, null, null, null, null, null, null);
        int n = Math.max(1, Math.min(limit, 50));
        var cursor = Cursor.decode(rawCursor);
        String zone = repo.zoneOf(client);
        var rows = repo.payments(client, zone, cursor == null ? null : cursor.keyAsTimestamp(), cursor == null ? null : cursor.id(), n + 1);
        boolean more = rows.size() > n;
        var page = more ? rows.subList(0, n) : rows;
        String next = more ? Cursor.encode(Cursor.key(page.getLast().paidAt()), page.getLast().item().id()) : null;
        // Owed as of the client's today: a single session sold for a day still to come is not owed yet (21 Nov 2026).
        BigDecimal due = packages.dueForClient(repo.trainerOf(client), client, java.time.LocalDate.now(java.time.ZoneId.of(zone)));
        // Only when there is something to pay: a pay link beside ₹0.00 is a prompt with nothing behind it.
        String payTo = due.signum() > 0 ? repo.payTo(client) : null;
        java.time.LocalDate today = java.time.LocalDate.now(java.time.ZoneId.of(zone));
        // V50: the packs a report can name — the trainer's ledger, not a second sum, as for amountDue above.
        var owed = packages.list(repo.trainerOf(client), true, client, today).stream()
                .filter(k -> new BigDecimal(k.amountDue()).signum() > 0)
                .map(k -> new PortalMoney.Owed(k.id(), k.name(), k.amountDue(), k.dueDate()))
                .toList();
        var t = claims.terms(client);
        var terms = t == null ? null : new PortalMoney.Terms(t.path("part_payments").asBoolean(true), t.path("collector").asString(),
                t.path("gym_name").isString() ? t.path("gym_name").asString() : null);
        return new PortalMoney.Money(true, repo.currency(client), due.setScale(2).toPlainString(),
                new PortalMoney.Payments(page.stream().map(PortalMoneyJdbcRepository.PaymentRow::item).toList(), next), payTo,
                owed, claims.recentForClient(client), terms);
    }

    /** A claim and whether this call made it (201) or found it (200, a retried tap). */
    public record Claimed(PaymentClaim claim, boolean created) {}

    /**
     * "I've paid" (V50). Everything is checked by {@code client_claim_payment()}, the only way a claim is made — the lens, the
     * money switch, the pack, what is left on it less other open reports, the part-payment switch — and its answer is turned
     * into a code here.
     */
    @Transactional
    public Claimed claim(String phone, PortalMoney.ClaimRequest req) {
        UUID client = access.clientId(phone);
        if (!repo.moneyVisible(client)) throw ApiException.notFound("Payments are not shown here.");
        BigDecimal amount;
        try {
            if (!(req.amount() instanceof String) && !(req.amount() instanceof Number)) throw new NumberFormatException();
            amount = new BigDecimal(String.valueOf(req.amount()).strip());
            if (amount.signum() <= 0 || amount.scale() > 2 || amount.compareTo(new BigDecimal("99999999.99")) > 0) throw new NumberFormatException();
        } catch (NumberFormatException e) {
            throw ApiException.validation("amount: a decimal amount above zero, like \"4000.00\"");
        }
        String reference = blank(req.reference());
        String note = blank(req.note());
        var r = claims.claim(req.id(), client, req.packageId(), amount, req.paidOn(), reference, note);
        String result = r.path("result").asString();
        String room = r.path("room").isMissingNode() ? null : new BigDecimal(r.path("room").asString()).setScale(2).toPlainString();
        return switch (result) {
            case "created", "existing" -> new Claimed(claims.forClient(client, req.id()).orElseThrow(), "created".equals(result));
            case "conflict" -> throw ApiException.idConflict();
            case "no_package" -> throw ApiException.notFound("That pack is not one you can pay for.");
            case "nothing_due" -> throw ApiException.conflict("CLAIM_NOTHING_DUE", "Nothing is left to pay on this pack.");
            case "over_due" -> throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "CLAIM_OVER_DUE", "₹" + room + " is all that's left on this pack.");
            case "whole_only" -> throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "CLAIM_WHOLE_ONLY", "Your trainer takes the whole of it in one go: ₹" + room + ".");
            case "too_many" -> throw ApiException.conflict("CLAIM_TOO_MANY", "You have five payments waiting to be confirmed. Give your trainer a moment.");
            case "bad_date" -> throw ApiException.validation("paidOn: today or within the last 90 days");
            default -> throw new IllegalStateException("client_claim_payment answered " + result);
        };
    }

    /** "I tapped it by mistake": only an open report can be taken back. */
    @Transactional
    public void withdraw(String phone, UUID claimId) {
        access.clientId(phone);
        String result = claims.withdraw(claimId).path("result").asString();
        switch (result) {
            case "withdrawn", "already" -> { }
            case "decided" -> throw ApiException.conflict("CLAIM_DECIDED", "Your trainer has already answered this one.");
            default -> throw ApiException.notFound("That payment report is not yours.");
        }
    }

    /** A receipt for one of the client's own collected payments; 404 for anything else. */
    public PortalMoney.Receipt receipt(String phone, UUID paymentId) {
        access.clientId(phone);
        var r = claims.receipt(paymentId);
        if (r == null) throw ApiException.notFound("No receipt for that payment.");
        var b = r.path("business");
        String id = r.path("id").asString();
        return new PortalMoney.Receipt(id, id.substring(0, 8).toUpperCase(),
                java.time.OffsetDateTime.parse(r.path("paid_at").asString()).toInstant().toEpochMilli(),
                new BigDecimal(r.path("amount").asString()).setScale(2).toPlainString(), r.path("currency").asString(),
                text(r, "method"), text(r, "reference"), text(r, "collected_by"), text(r, "package"), text(r, "client"),
                text(r, "trainer"), text(r, "gym_name"),
                new PortalMoney.Business(text(b, "name"), text(b, "tagline"), text(b, "phone"), text(b, "email"),
                        text(b, "address_line1"), text(b, "address_line2"), text(b, "city"), text(b, "state"), text(b, "pincode")));
    }

    private static String text(JsonNode n, String key) {
        return n.path(key).isString() ? n.path(key).asString() : null;
    }

    private static String blank(String s) {
        if (s == null) return null;
        String t = s.strip();
        return t.isEmpty() ? null : t;
    }

    private static String date(JsonNode n, String key) {
        return n.path(key).isString() ? n.path(key).asString() : null;
    }
}
