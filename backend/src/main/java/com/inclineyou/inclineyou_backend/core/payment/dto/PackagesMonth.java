package com.inclineyou.inclineyou_backend.core.payment.dto;

import java.math.BigDecimal;

/** Packages sold in one month: how many, what they billed, and the gym's part of it. */
public record PackagesMonth(String month, int sold, BigDecimal billed, BigDecimal gymCut) {}
