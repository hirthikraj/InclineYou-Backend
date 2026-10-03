package com.inclineyou.inclineyou_backend.core.payment.dto;

import java.math.BigDecimal;

/** What one pack (or '' for a custom sale) sold in the span; take is the trainer's part of it. */
public record PackSales(int sold, BigDecimal billed, BigDecimal take) {}
