package com.inclineyou.inclineyou_backend.shared.util;

import java.math.BigDecimal;
import java.math.RoundingMode;

/** Money on the wire is a decimal string, never a float. */
public final class Money {

    private Money() {}

    /** Two decimals, half-up, plain notation ("4000.00"). Null stays null. */
    public static String format(BigDecimal v) {
        return v == null ? null : v.setScale(2, RoundingMode.HALF_UP).toPlainString();
    }

    /** As {@link #format}, with an absent amount drawn as zero — what an aggregate prints. */
    public static String formatOrZero(BigDecimal v) {
        return format(v == null ? BigDecimal.ZERO : v);
    }
}
