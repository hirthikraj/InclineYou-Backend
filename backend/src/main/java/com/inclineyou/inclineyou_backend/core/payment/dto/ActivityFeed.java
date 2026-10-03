package com.inclineyou.inclineyou_backend.core.payment.dto;

import java.util.List;

public record ActivityFeed(String currency, List<ActivityItem> items, String nextCursor) {}
