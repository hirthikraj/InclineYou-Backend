package com.inclineyou.inclineyou_backend.core.payment.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/** A package to insert — a sale or a renewal. due_date is the day it starts unless a sale names another. */
public record NewPackage(UUID id, UUID trainerId, UUID clientId, UUID packId, String name, String service, String basis,
                         Integer sessions, BigDecimal amount, BigDecimal discount, String currency,
                         LocalDate start, LocalDate end, LocalDate due,
                         BigDecimal sharePercent, BigDecimal shareAmount) {}
