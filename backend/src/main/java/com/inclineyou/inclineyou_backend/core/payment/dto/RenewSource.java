package com.inclineyou.inclineyou_backend.core.payment.dto;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;

/** The package being renewed and, when its pack is still on the price list, that pack's current terms. */
public record RenewSource(String clientId, String packId, String name, String service, String basis,
                          Integer sessionsTotal, BigDecimal amount, String currency, Date startDate, Date endDate,
                          BigDecimal sharePercent, BigDecimal shareAmount, Timestamp createdAt,
                          boolean packLive, String packName, String packService, String packBasis, Integer packSessions,
                          BigDecimal packAmount, String packCurrency, Integer packValidity,
                          BigDecimal packSharePercent, BigDecimal packShareAmount) {}
