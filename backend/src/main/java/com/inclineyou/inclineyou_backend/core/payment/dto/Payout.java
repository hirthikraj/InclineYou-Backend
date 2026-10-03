package com.inclineyou.inclineyou_backend.core.payment.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;

public record Payout(String id, String gymName, String gymPlaceId, String amount, String currency, String method, String reference,
                     String note, long receivedAt, long createdAt, String version,
                     @JsonIgnore String cursorKey) {}
