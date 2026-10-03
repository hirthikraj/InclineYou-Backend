package com.inclineyou.inclineyou_backend.core.payment.dto;

public record Arrangement(String id, String gymName, String gymPlaceId, String baseKind, String baseAmount, String currency,
                          String startsMonth, String endsMonth, String note,
                          long createdAt, long updatedAt, String version) {}
