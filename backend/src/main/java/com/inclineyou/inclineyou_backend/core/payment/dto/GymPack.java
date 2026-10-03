package com.inclineyou.inclineyou_backend.core.payment.dto;

import java.math.BigDecimal;

/** A pack with the terms the gym page prints; price/shares null for a custom sale. */
public record GymPack(String id, String name, BigDecimal amount, BigDecimal trainerSharePercent, BigDecimal trainerShareAmount) {}
