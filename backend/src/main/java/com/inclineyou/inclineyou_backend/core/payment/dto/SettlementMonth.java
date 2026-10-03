package com.inclineyou.inclineyou_backend.core.payment.dto;

public record SettlementMonth(String month, boolean soFar, int clients, String yourShare, String owed,
                              String received, String balance) {}
