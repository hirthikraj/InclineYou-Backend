package com.inclineyou.inclineyou_backend.core.sessionlog.dto;

import java.math.BigDecimal;

/**
 * One set on the wire. Every quantity is a JSON number in the set's own kind (kg for weight, % for percent_1rm,
 * reps, seconds, metres…); {@code doneAt} null means not done yet, or skipped. In a plan preview (the session has not
 * started) {@code id} is null: nothing exists to key a write on.
 */
public record SetRow(String id, int position, boolean planned, String loadKind, String effortKind, SetTarget target,
                     BigDecimal loadValue, BigDecimal effortValue, BigDecimal rpe, String notes, Long doneAt) {}
