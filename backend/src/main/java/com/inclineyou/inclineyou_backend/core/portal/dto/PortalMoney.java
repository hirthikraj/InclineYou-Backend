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

    /**
     * {@code {visible: false}} and nothing else when the trainer has switched it off — a state the screen hides a tab for, not an error.
     *
     * <p>V50 (23 Nov 2026) adds what "I've paid" needs: {@code owed}, each pack with money left on it (what a claim can name);
     * {@code claims}, the client's open reports and those decided in the last 30 days; and {@code terms} — may they pay part of a
     * pack, and who they pay (the trainer, or the gym's desk for a gym client, whose {@code payTo} is therefore always absent).
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Money(boolean visible, String currency, String amountDue, Payments payments, String payTo,
                        List<Owed> owed, List<com.inclineyou.inclineyou_backend.core.payment.dto.PaymentClaim> claims, Terms terms) {}

    /** A pack with money left on it. {@code dueDate} YYYY-MM-DD, when the trainer set one. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Owed(String packageId, String name, String amountDue, String dueDate) {}

    /** {@code collector}: trainer · gym. {@code gymName} only for gym. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Terms(boolean partPayments, String collector, String gymName) {}

    /** {@code POST /v1/portal/payment-claims} — "I've paid". The id is the client's, so a retried tap is the same report. */
    public record ClaimRequest(
            @jakarta.validation.constraints.NotNull(message = "required") java.util.UUID id,
            java.util.UUID packageId,
            /** A decimal string, like every money field ("1000.00"); a bare number is accepted too. */
            @jakarta.validation.constraints.NotNull(message = "required") Object amount,
            @jakarta.validation.constraints.NotNull(message = "required") java.time.LocalDate paidOn,
            @jakarta.validation.constraints.Size(max = 64, message = "at most 64 characters") String reference,
            @jakarta.validation.constraints.Size(max = 280, message = "at most 280 characters") String note) {}

    /** A receipt for one of the client's own collected payments (V50's client_receipt). {@code paidAt} epoch ms. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Receipt(String id, String number, long paidAt, String amount, String currency, String method, String reference,
                          String collectedBy, String packageName, String clientName, String trainerName, String gymName, Business business) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Business(String name, String tagline, String phone, String email, String addressLine1, String addressLine2,
                           String city, String state, String pincode) {}
}
