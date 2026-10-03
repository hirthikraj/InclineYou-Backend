package com.inclineyou.inclineyou_backend.core.payment.dto;

import java.math.BigDecimal;

/** A price-list pack as a sale copies it. */
public record SalePack(String name, String service, String basis, Integer sessions, Integer validityDays,
                       BigDecimal amount, String currency, String owner, String status,
                       BigDecimal trainerSharePercent, BigDecimal trainerShareAmount) {}
