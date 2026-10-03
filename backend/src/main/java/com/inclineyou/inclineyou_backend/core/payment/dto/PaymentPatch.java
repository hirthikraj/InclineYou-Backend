package com.inclineyou.inclineyou_backend.core.payment.dto;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;

/** The columns a payment correction sets: only the ones flagged are written. */
public record PaymentPatch(boolean setAmount, BigDecimal amount, boolean setMethod, String method,
                           boolean setReference, String reference, boolean setPaidAt, Timestamp paidAt,
                           boolean setNote, String note) {
    public List<String> columns() {
        var sets = new ArrayList<String>();
        if (setAmount) sets.add("amount = :amount");
        if (setMethod) sets.add("method = :method");
        if (setReference) sets.add("reference = :reference");
        if (setPaidAt) sets.add("paid_at = :paidAt");
        if (setNote) sets.add("note = :note");
        return sets;
    }
}
