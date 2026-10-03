package com.inclineyou.inclineyou_backend.core.payment.dto;

import java.math.BigDecimal;

public record PaymentSums(BigDecimal paid, BigDecimal writtenOff, BigDecimal pending) {}
