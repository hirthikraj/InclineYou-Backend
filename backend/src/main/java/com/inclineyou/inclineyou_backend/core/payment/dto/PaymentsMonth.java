package com.inclineyou.inclineyou_backend.core.payment.dto;

import java.math.BigDecimal;

/** One payment status's rows in one month: how many, their sum, and (paid only) the trainer's part of it. */
public record PaymentsMonth(String month, int count, BigDecimal total, BigDecimal takeHome) {}
