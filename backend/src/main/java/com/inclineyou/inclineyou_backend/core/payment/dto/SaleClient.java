package com.inclineyou.inclineyou_backend.core.payment.dto;

/** The client a sale is for, read FOR UPDATE: their status and whether the gym collects for them. */
public record SaleClient(String status, String clientType) {}
