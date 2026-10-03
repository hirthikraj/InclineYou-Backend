package com.inclineyou.inclineyou_backend.core.payment.dto;

import java.math.BigDecimal;

/** One month's sums: {@code a} is the headline amount (billed or collected), {@code b} the trainer's part where it applies. */
public record MonthAmounts(String month, BigDecimal a, BigDecimal b) {}
