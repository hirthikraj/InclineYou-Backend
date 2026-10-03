package com.inclineyou.inclineyou_backend.core.sessionlog.dto;

import java.math.BigDecimal;

/** A set as it was last time: values and kinds only. */
public record SetValue(BigDecimal loadValue, BigDecimal effortValue, String loadKind, String effortKind) {}
