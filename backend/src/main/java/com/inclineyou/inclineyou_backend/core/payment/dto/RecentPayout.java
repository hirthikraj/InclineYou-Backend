package com.inclineyou.inclineyou_backend.core.payment.dto;

public record RecentPayout(String id, String amount, String method, String reference, long receivedAt, String note) {}
