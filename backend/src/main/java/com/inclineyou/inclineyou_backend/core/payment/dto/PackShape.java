package com.inclineyou.inclineyou_backend.core.payment.dto;

import java.math.BigDecimal;

/** The pack as one validated value — what a create is built from and a PATCH merges into. */
public record PackShape(String name, String service, String basis, Integer sessions, Integer validityDays,
                        BigDecimal amount, String owner, BigDecimal pct, BigDecimal shareAmount) {}
