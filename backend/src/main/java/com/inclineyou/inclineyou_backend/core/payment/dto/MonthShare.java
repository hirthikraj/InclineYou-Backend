package com.inclineyou.inclineyou_backend.core.payment.dto;

import java.math.BigDecimal;

/** Money the gym took for the trainer in one month (refunds already negative), and how many clients it came from. */
public record MonthShare(String month, BigDecimal share, int clients) {}
