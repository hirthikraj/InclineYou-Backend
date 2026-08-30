package com.xrep.xrep_backend.payment;

import lombok.Getter;
import org.springframework.http.HttpStatus;

/**
 * A rule about a SOLD package said no.
 *
 * <p>Sibling to {@link PackRuleException}, and separate from it for the reason
 * one letter separates the two tables: that one is the price list, where the
 * refusals are about what a pack may say ("A pack needs a price"), and this one
 * is about what may happen to an arrangement a client is already inside
 * ("That pack is already paused"). Merging them would put a validation error and
 * a state conflict behind one {@code code} namespace, and the screens branch on
 * {@code code}.
 *
 * <h2>409 is the common case here, and it was 400 next door</h2>
 *
 * <p>Almost every refusal on this path is a well-formed request against a state
 * that will not take it — pausing a paused pack, resuming a running one,
 * extending one that closed in March. That is a conflict, not a malformed body,
 * and the distinction matters to the caller: a 400 means *fix what you sent* and
 * a 409 means *the world moved, re-read it*. The web's panels re-fetch on 409
 * and show the sentence on 400.
 *
 * <h2>404, not 403, for another trainer's package</h2>
 *
 * <p>The standing convention, unchanged: ownership is a query filter, and 404
 * exists so a trainer cannot confirm another trainer's row is real by probing
 * for its id.
 */
@Getter
public class PackageRuleException extends RuntimeException {

    private final String code;
    private final HttpStatus status;

    public PackageRuleException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    /* ── 400: the request cannot be carried out as written ─────────────────── */

    public static PackageRuleException needsPrice() {
        return new PackageRuleException(HttpStatus.BAD_REQUEST, "PACKAGE_NEEDS_PRICE",
                "A package needs a price.");
    }

    public static PackageRuleException needsSessions() {
        return new PackageRuleException(HttpStatus.BAD_REQUEST, "PACKAGE_NEEDS_SESSIONS",
                "How many sessions is in this package?");
    }

    public static PackageRuleException unknownValue(String field, String value) {
        return new PackageRuleException(HttpStatus.BAD_REQUEST, "PACKAGE_FIELD_INVALID",
                "Unknown %s: %s".formatted(field, value));
    }

    public static PackageRuleException badDate(String field) {
        return new PackageRuleException(HttpStatus.BAD_REQUEST, "PACKAGE_FIELD_INVALID",
                "%s must be a date, as YYYY-MM-DD.".formatted(field));
    }

    /**
     * An extension of zero days is a no-op wearing a write's clothes, and a
     * negative one is almost always a typo for the positive. Both are refused by
     * name rather than clamped, because a trainer who meant to give away a
     * fortnight should not find out months later that nothing happened.
     *
     * <p>The cap is a sanity bound, not a policy: ten years of goodwill is a
     * fat-fingered year field.
     */
    public static PackageRuleException badExtension() {
        return new PackageRuleException(HttpStatus.BAD_REQUEST, "PACKAGE_BAD_EXTENSION",
                "Extend by a number of days between 1 and 365.");
    }

    /**
     * A validity extension needs something to extend. A pack sold with no expiry
     * — which is what most Indian trainers actually run, per V11's own note on
     * `pack.validity_days` — already never runs out, and pushing its `NULL`
     * end date two weeks further would be arithmetic on nothing.
     */
    public static PackageRuleException noExpiry() {
        return new PackageRuleException(HttpStatus.CONFLICT, "PACKAGE_NO_EXPIRY",
                "That pack has no expiry date, so there is nothing to extend. It runs until the sessions are used.");
    }

    /* ── 409: well-formed, and the state says no ───────────────────────────── */

    public static PackageRuleException alreadyPaused() {
        return new PackageRuleException(HttpStatus.CONFLICT, "PACKAGE_ALREADY_PAUSED",
                "That pack is already paused.");
    }

    public static PackageRuleException notPaused() {
        return new PackageRuleException(HttpStatus.CONFLICT, "PACKAGE_NOT_PAUSED",
                "That pack is not paused.");
    }

    /**
     * Pausing, resuming or extending a pack that has already finished.
     *
     * <p>Refused rather than allowed-and-ignored: the recovery is to sell a new
     * one, and a screen that lets a trainer pause a closed pack has told them
     * their client is covered when they are not.
     */
    public static PackageRuleException notLive() {
        return new PackageRuleException(HttpStatus.CONFLICT, "PACKAGE_NOT_LIVE",
                "That pack has finished. Renew it instead.");
    }

    /* ── 404: as far as this trainer is concerned, it is not there ─────────── */

    public static PackageRuleException notFound() {
        return new PackageRuleException(HttpStatus.NOT_FOUND, "PACKAGE_NOT_FOUND",
                "That package is not on your books.");
    }

    public static PackageRuleException clientNotFound() {
        return new PackageRuleException(HttpStatus.NOT_FOUND, "CLIENT_NOT_FOUND",
                "That client is not on your roster.");
    }
}
