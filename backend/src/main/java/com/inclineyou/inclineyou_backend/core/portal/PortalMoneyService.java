package com.inclineyou.inclineyou_backend.core.portal;

import com.inclineyou.inclineyou_backend.core.payment.PackageJdbcRepository;
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
        if (!repo.moneyVisible(client)) return new PortalMoney.Money(false, null, null, null);
        int n = Math.max(1, Math.min(limit, 50));
        var cursor = Cursor.decode(rawCursor);
        var rows = repo.payments(client, repo.zoneOf(client), cursor == null ? null : cursor.keyAsTimestamp(), cursor == null ? null : cursor.id(), n + 1);
        boolean more = rows.size() > n;
        var page = more ? rows.subList(0, n) : rows;
        String next = more ? Cursor.encode(Cursor.key(page.getLast().paidAt()), page.getLast().item().id()) : null;
        BigDecimal due = packages.dueForClient(repo.trainerOf(client), client);
        return new PortalMoney.Money(true, repo.currency(client), due.setScale(2).toPlainString(),
                new PortalMoney.Payments(page.stream().map(PortalMoneyJdbcRepository.PaymentRow::item).toList(), next));
    }

    private static String date(JsonNode n, String key) {
        return n.path(key).isString() ? n.path(key).asString() : null;
    }
}
