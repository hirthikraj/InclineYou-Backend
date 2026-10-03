package com.inclineyou.inclineyou_backend.core.sessionlog;

import com.inclineyou.inclineyou_backend.shared.exception.ApiException;

import java.math.BigDecimal;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Reading a PATCH body. A set's or an exercise's PATCH is a raw {@code Map} on purpose: the key's PRESENCE is the
 * contract (absent = leave it, null = clear it), which a record cannot say. Everything is checked here, so an unknown
 * key, a string where a number belongs, or a value out of range is a 400 that names the field.
 */
final class Body {

    private Body() {}

    static void only(Map<String, Object> body, Set<String> allowed) {
        for (String key : body.keySet()) {
            if (!allowed.contains(key)) throw ApiException.validation(key + ": not a field of this request");
        }
    }

    /** A JSON number, never a numeric string. */
    static BigDecimal number(Map<String, Object> body, String key) {
        Object v = body.get(key);
        if (v == null) return null;
        if (v instanceof Number n) return new BigDecimal(n.toString());
        throw ApiException.validation(key + ": a number");
    }

    static Boolean bool(Map<String, Object> body, String key) {
        Object v = body.get(key);
        if (v == null) return null;
        if (v instanceof Boolean b) return b;
        throw ApiException.validation(key + ": true or false");
    }

    static Integer integer(Map<String, Object> body, String key) {
        BigDecimal n = number(body, key);
        if (n == null) return null;
        try {
            return n.intValueExact();
        } catch (ArithmeticException e) {
            throw ApiException.validation(key + ": a whole number");
        }
    }

    static String text(Map<String, Object> body, String key) {
        Object v = body.get(key);
        if (v == null) return null;
        if (v instanceof String s) return s;
        throw ApiException.validation(key + ": text");
    }

    static UUID uuid(String raw, String field) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return UUID.fromString(raw.strip());
        } catch (IllegalArgumentException e) {
            throw ApiException.validation(field + ": not an id");
        }
    }
}
