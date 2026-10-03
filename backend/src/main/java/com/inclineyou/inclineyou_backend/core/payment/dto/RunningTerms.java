package com.inclineyou.inclineyou_backend.core.payment.dto;

import java.time.YearMonth;

/** The running pay terms, locked: which row, and the month it began. */
public record RunningTerms(String id, YearMonth startsMonth) {}
