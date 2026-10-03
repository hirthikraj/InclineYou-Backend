package com.inclineyou.inclineyou_backend.core.payment.dto;

import java.math.BigDecimal;
import java.time.Instant;

/** A payout as settlement needs it: which gym (by place or name), how much, when. */
public record PayoutRecord(String gymName, String gymPlaceId, BigDecimal amount, Instant receivedAt) {}
