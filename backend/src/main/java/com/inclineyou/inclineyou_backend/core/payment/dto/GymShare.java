package com.inclineyou.inclineyou_backend.core.payment.dto;

import java.math.BigDecimal;

public record GymShare(String packId, String packName, BigDecimal trainerSharePercent, String trainerShareAmount,
                       /** What the gym keeps of one sale at the pack's price — derived, never stored. */
                       BigDecimal gymSharePercent, String gymShareAmount,
                       int sold, String billed, String trainerTake, String gymCut) {}
