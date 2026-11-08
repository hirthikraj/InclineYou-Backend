package com.inclineyou.inclineyou_backend.core.portal.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * The client's package and money wire (api-contract 1.2, pm-l1 and pm-l2). Quiet and factual: sessions and dates are the client's own and are
 * never behind the money switch; a price, a payment and the ledger are, and appear only when the trainer lets this client see money. Nothing here
 * can nudge or shame. Since 6 Nov 2026 it can carry ONE way to pay: {@code payTo}, the trainer's UPI ID, present only when
 * something is owed and the trainer has set one (V31's client_pay_to). The portal turns it into a upi:// link; no money
 * moves through InclineYou, and the trainer still marks the payment received.
 */
public final class PortalMoney {

    private PortalMoney() {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Pack(String id, String name, String status, Integer sessionsTotal, Integer sessionsUsed, Integer sessionsLeft, String startsOn, String expiresOn,
                       boolean paused) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Past(String id, String name, String status, Integer sessionsTotal, String startsOn, String endedOn) {}

    /** {@code sessions} and {@code days} ride only when the entry moved them. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Entry(long at, String kind, Integer sessions, Integer days) {}

    /** {@code package} is the one being followed, else null; {@code history} is ABSENT (not null, not empty) when money is hidden. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Package(@com.fasterxml.jackson.annotation.JsonProperty("package") @JsonInclude(JsonInclude.Include.ALWAYS) Pack pack, List<Past> past, List<Entry> history) {}

    public record Payment(String id, String paidOn, String amount, String method, String reference, String packageName, String status) {}

    public record Payments(List<Payment> items, String nextCursor) {}

    /** {@code {visible: false}} and nothing else when the trainer has switched it off — a state the screen hides a tab for, not an error. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Money(boolean visible, String currency, String amountDue, Payments payments, String payTo) {}
}
