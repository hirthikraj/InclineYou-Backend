package com.inclineyou.inclineyou_backend.core.payment.dto;

import java.util.List;

public record GymMoney(String currency, String gymName, GymStats stats, List<GymShare> shares, Settlement settlement) {}
