package com.inclineyou.inclineyou_backend.core.payment.dto;

import java.util.List;

public record MoneySummary(String currency, List<SummaryMonth> months, SummaryTotal total, SummaryNow now) {}
