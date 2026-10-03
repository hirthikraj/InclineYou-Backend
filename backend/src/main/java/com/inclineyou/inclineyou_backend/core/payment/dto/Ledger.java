package com.inclineyou.inclineyou_backend.core.payment.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/** {@code total} only with {@code includeTotal=true}. */
public record Ledger(String currency, List<PaymentRow> items, String nextCursor,
                     @JsonInclude(JsonInclude.Include.NON_NULL) Integer total) {}
