package com.inclineyou.inclineyou_backend.core.sessionlog.dto;

import java.math.BigDecimal;

/**
 * An extra set. Kinds default to the exercise's last set. Always logged as it is added (done defaults to true).
 * {@code notes} (at most 200 characters) is optional.
 */
public record AddSetRequest(String id, BigDecimal loadValue, BigDecimal effortValue, BigDecimal rpe, Boolean done,
                            String loadKind, String effortKind, String notes) {}
