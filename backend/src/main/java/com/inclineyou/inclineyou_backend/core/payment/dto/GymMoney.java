package com.inclineyou.inclineyou_backend.core.payment.dto;

import java.util.List;

/**
 * {@code GET /v1/money/gym}. {@code statement} and {@code lifetime} (23 Nov 2026) are additive: the statement a trainer shows
 * the gym — what they sold and delivered for it in the span, and since the start.
 */
public record GymMoney(String currency, String gymName, GymStats stats, List<GymShare> shares, Settlement settlement,
                       GymStatement statement, GymLifetime lifetime) {}
