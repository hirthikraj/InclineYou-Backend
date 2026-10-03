package com.inclineyou.inclineyou_backend.core.trainer.dto;

import java.math.BigDecimal;

/**
 * The gym a trainer picked from the place search, as the web's server read it off
 * the Places API. {@code placeId} is the identity; everything else is directory
 * detail. See V8 for why this is {@code gym_place} and never {@code gym}.
 */
public record GymPlaceInput(
        String placeId,
        String name,
        String address,
        String city,
        BigDecimal lat,
        BigDecimal lng,
        String mapLink
) {}
