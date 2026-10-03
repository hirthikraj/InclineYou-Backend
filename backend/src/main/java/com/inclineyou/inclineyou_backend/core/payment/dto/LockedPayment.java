package com.inclineyou.inclineyou_backend.core.payment.dto;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.util.UUID;

/** A live payment as the ledger's writes read it. */
public record LockedPayment(UUID packageId, String status, BigDecimal amount, String method, String reference,
                            String note, Timestamp updatedAt) {}
