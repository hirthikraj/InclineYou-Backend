package com.inclineyou.inclineyou_backend.core.payment.dto;

import java.util.List;

public record PracticeReport(String currency, List<PracticeMonth> months, PracticeHeadline headline,
                             List<TopClient> topClients) {}
