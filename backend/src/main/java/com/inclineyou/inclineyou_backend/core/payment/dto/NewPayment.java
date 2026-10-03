package com.inclineyou.inclineyou_backend.core.payment.dto;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.util.UUID;

/** A payment row to insert. collected_by is stamped by the database from the client's type, whatever is sent. */
public record NewPayment(UUID id, UUID trainerId, UUID packageId, UUID clientId, BigDecimal amount, String currency,
                         String method, String status, String reference, Timestamp paidAt, Timestamp writtenOffAt,
                         Timestamp refundedAt, String note) {}
