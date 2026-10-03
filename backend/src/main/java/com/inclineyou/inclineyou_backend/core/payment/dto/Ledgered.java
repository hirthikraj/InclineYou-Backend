package com.inclineyou.inclineyou_backend.core.payment.dto;

import java.util.Map;

/** What a money write answers with: the row, and the package with its new sums. */
public record Ledgered(PaymentRow payment, CurrentPackage pkg, boolean created) {
    public Map<String, Object> body() {
        return Map.of("payment", payment, "package", pkg);
    }
}
