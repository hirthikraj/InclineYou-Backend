package com.inclineyou.inclineyou_backend.core.payment.dto;

import com.inclineyou.inclineyou_backend.shared.wire.Cursor;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** A ledger query after validation: every value checked, every date resolved to an instant. Null = no filter. */
public record LedgerFilter(List<String> statuses, List<String> methods, List<String> collectors, List<String> clientTypes,
                           UUID clientId, UUID packageId, Instant from, Instant to, Cursor after, int limit) {}
