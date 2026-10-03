package com.inclineyou.inclineyou_backend.core.payment.dto;

import java.math.BigDecimal;

/** The span's floor (gym-pack) and own-books packages, as the database sums them. */
public record GymSaleStats(BigDecimal floorBilled, long floorSessions, BigDecimal gymCut,
                           BigDecimal remoteBilled, long remoteSessions) {}
