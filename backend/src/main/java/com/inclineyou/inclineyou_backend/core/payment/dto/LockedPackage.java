package com.inclineyou.inclineyou_backend.core.payment.dto;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.util.UUID;

/** A package read FOR UPDATE with its client's type — what every ledger write decides from. */
public record LockedPackage(UUID id, UUID clientId, String status, BigDecimal amount, String currency,
                            Timestamp pausedAt, Date endDate, String clientType, UUID sessionId, Date startDate) {

    /** A single session's own sale (V32): it has no clock to pause, resume or extend. */
    public boolean singleSale() {
        return sessionId != null;
    }
}
