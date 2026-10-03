package com.inclineyou.inclineyou_backend.core.payment.dto;

/** The ledger's query string, as it arrived — validated and parsed into a {@link LedgerFilter} by the service. */
public record LedgerQuery(String status, String from, String to, String method, String clientId,
                          String packageId, String collectedBy, String clientType,
                          Integer limit, String cursor, boolean includeTotal) {}
