package com.inclineyou.inclineyou_backend.core.session;

import com.inclineyou.inclineyou_backend.shared.exception.ApiException;

import java.math.BigDecimal;
import java.util.Set;

/**
 * The one reading of a session's {@code billing} and {@code price} (V32), shared by booking and
 * {@code POST /v1/sessions/{id}/billing} so the two cannot accept different shapes.
 */
final class SessionBillingRules {

    static final Set<String> BILLINGS = Set.of("pack", "trial", "complimentary", "single");

    /** The billing and price as stored: {@code billing} defaults to {@code pack}; a price only, and always, on single. */
    record Billing(String billing, BigDecimal price) {}

    private SessionBillingRules() {}

    static Billing read(String billing, String price) {
        String b = billing == null || billing.isBlank() ? "pack" : billing.strip();
        if (!BILLINGS.contains(b)) throw ApiException.validation("billing: pack, trial, complimentary or single");
        if (!"single".equals(b)) {
            if (price != null) throw ApiException.validation("price: only a single session has a price");
            return new Billing(b, null);
        }
        if (price == null || price.isBlank()) throw ApiException.validation("price: required for a single session");
        BigDecimal v;
        try {
            v = new BigDecimal(price.strip());
        } catch (NumberFormatException e) {
            throw ApiException.validation("price: a decimal amount like \"800.00\"");
        }
        if (v.signum() <= 0 || v.scale() > 2 || v.compareTo(new BigDecimal("99999999.99")) > 0) {
            throw ApiException.validation("price: a decimal amount above 0, like \"800.00\"");
        }
        return new Billing(b, v);
    }

    /** A gym client buys the gym's packs only (check_package_client_type), so cannot be sold a session of their own. */
    static ApiException gymClientSingle() {
        return new ApiException(org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY, "SESSION_SINGLE_GYM_CLIENT",
                "A gym client pays the gym, so a session can't be sold to them on its own. Book it on their pack.");
    }
}
