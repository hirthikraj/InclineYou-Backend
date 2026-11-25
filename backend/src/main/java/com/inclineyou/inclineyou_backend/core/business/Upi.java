package com.inclineyou.inclineyou_backend.core.business;

import com.inclineyou.inclineyou_backend.shared.exception.ApiException;

import java.util.regex.Pattern;

/**
 * The UPI ID's shape: {@code handle@psp}. The same rule as the web's {@code isUpiFormat} and V46's
 * {@code tenant_business_upi_shape}, so a refusal is a 400 with a field name rather than a constraint error. Shape only —
 * nothing here can tell whose account it is, and the screens say so.
 */
public final class Upi {

    private static final Pattern SHAPE = Pattern.compile("^[A-Za-z0-9._-]{2,99}@[A-Za-z][A-Za-z0-9.-]{1,63}$");

    /** The trimmed ID, or a 400 naming {@code field}. */
    public static String check(String field, String raw) {
        String v = raw.strip();
        if (v.length() > 100 || !SHAPE.matcher(v).matches()) {
            throw ApiException.validation(field + ": a UPI ID looks like name@bank — e.g. 9876543210@okaxis");
        }
        return v;
    }

    private Upi() {}
}
