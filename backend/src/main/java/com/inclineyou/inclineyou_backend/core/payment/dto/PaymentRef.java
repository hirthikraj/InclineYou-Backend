package com.inclineyou.inclineyou_backend.core.payment.dto;

import java.sql.Timestamp;
import java.util.UUID;

/** A payment row whether or not it is deleted — what an idempotent DELETE looks at. */
public record PaymentRef(UUID packageId, String status, Timestamp deletedAt) {}
