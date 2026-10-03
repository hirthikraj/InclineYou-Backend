package com.inclineyou.inclineyou_backend.core.payment.dto;

import java.math.BigDecimal;

/** What is owed as of today across every package — pending is everything, overdue is past its due date by a grace. */
public record DueTotals(BigDecimal pending, BigDecimal overdue, int clientsOwing, int clientsOverdue) {}
