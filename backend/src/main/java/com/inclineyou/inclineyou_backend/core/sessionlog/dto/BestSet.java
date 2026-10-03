package com.inclineyou.inclineyou_backend.core.sessionlog.dto;

import java.math.BigDecimal;

/**
 * The client's top set for this exercise among completed sessions, within the kinds the session is logging it in
 * (weights and reps rank by estimated 1RM, every other kind by its value). {@code e1rm} is Epley and only for
 * weight × reps.
 */
public record BestSet(String date, BigDecimal loadValue, BigDecimal effortValue, String loadKind, String effortKind,
                      BigDecimal e1rm) {}
