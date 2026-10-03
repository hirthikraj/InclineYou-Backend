package com.inclineyou.inclineyou_backend.core.payment.dto;

import com.inclineyou.inclineyou_backend.shared.wire.Cursor;

import java.time.Instant;

/** A payouts query after validation. {@code gymName} and {@code gymPlaceId} are alternatives; null = no gym filter. */
public record PayoutFilter(String gymName, String gymPlaceId, Instant from, Instant to, Cursor after, int limit) {}
