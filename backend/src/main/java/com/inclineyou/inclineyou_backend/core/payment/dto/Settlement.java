package com.inclineyou.inclineyou_backend.core.payment.dto;

import java.util.List;

public record Settlement(Arrangement arrangement, List<SettlementMonth> months,
                         String balanceDue, List<RecentPayout> recentPayouts) {}
