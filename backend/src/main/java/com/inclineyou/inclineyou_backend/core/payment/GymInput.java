package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.shared.exception.ApiException;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * The small body-reading rules the gym routes share — arrangements, payouts and
 * the money/gym query. Bodies are raw maps so that "key absent" and "key null"
 * stay different things (PATCH: leave it, clear it); every refusal names the
 * field, as the ledger's own parsers do.
 */
final class GymInput {

    private GymInput() {}

    static final int MAX_MONTHS = 24;
    static final Set<String> PAYOUT_METHODS = Set.of("upi", "cash", "bank_transfer");

    static Map<String, Object> body(Map<String, Object> raw, String... keys) {
        Map<String, Object> b = raw == null ? Map.of() : raw;
        var allowed = Set.of(keys);
        for (String key : b.keySet()) {
            if (!allowed.contains(key)) throw ApiException.validation(key + ": not a field this route takes");
        }
        return b;
    }

    static UUID uuid(Object raw, String field) {
        if (raw == null) return null;
        try {
            return UUID.fromString(String.valueOf(raw).strip());
        } catch (IllegalArgumentException e) {
            throw ApiException.validation(field + ": not an id");
        }
    }

    static String text(Object raw, int max, String field) {
        if (raw == null) return null;
        if (!(raw instanceof String s)) throw ApiException.validation(field + ": text or null");
        String v = s.strip();
        if (v.isEmpty()) return null;
        if (v.length() > max) throw ApiException.validation(field + ": at most " + max + " characters");
        return v;
    }

    /** A decimal amount, string or bare number, two places at most; {@code min} is 0 (allowed) or a strict floor via {@code strict}. */
    static BigDecimal amount(Object raw, String field, boolean strictlyPositive) {
        if (raw == null) throw ApiException.validation(field + ": required");
        try {
            BigDecimal v = new BigDecimal(String.valueOf(raw).strip());
            boolean low = strictlyPositive ? v.signum() <= 0 : v.signum() < 0;
            if (low || v.scale() > 2 || v.compareTo(new BigDecimal("99999999.99")) > 0) throw new NumberFormatException();
            return v;
        } catch (NumberFormatException e) {
            throw ApiException.validation(field + ": a decimal amount "
                    + (strictlyPositive ? "above zero" : "of zero or more") + ", like \"4000.00\"");
        }
    }

    static YearMonth month(Object raw, String field) {
        if (raw == null) return null;
        try {
            return YearMonth.parse(String.valueOf(raw).strip());
        } catch (DateTimeParseException e) {
            throw ApiException.validation(field + ": a month as yyyy-MM");
        }
    }

    static String payoutMethod(Object raw) {
        if (raw == null) return null;
        if (!(raw instanceof String s) || !PAYOUT_METHODS.contains(s)) {
            throw ApiException.validation("method: upi, cash or bank_transfer");
        }
        return s;
    }

    /** Epoch ms, back-datable, never in the future (a minute of clock skew allowed). */
    static Instant pastInstant(Object raw, String field) {
        if (!(raw instanceof Number n) || n.doubleValue() != n.longValue()) {
            throw ApiException.validation(field + ": epoch milliseconds");
        }
        Instant at = Instant.ofEpochMilli(n.longValue());
        if (at.isAfter(Instant.now().plusSeconds(60))) throw ApiException.validation(field + ": in the future");
        return at;
    }
}
