package com.inclineyou.inclineyou_backend.core.payment.dto;

import java.util.List;

public record PayoutPage(String currency, List<Payout> items, String nextCursor) {}
