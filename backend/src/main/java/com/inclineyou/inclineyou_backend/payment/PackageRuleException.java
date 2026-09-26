package com.inclineyou.inclineyou_backend.payment;

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

    /**
     * A corrected count has to be a count. The cap is the same kind of bound
     * {@link #badExtension} carries and for the same reason.
     */
    public static PackageRuleException badSessionCount(int max) {
        return new PackageRuleException(HttpStatus.BAD_REQUEST, "PACKAGE_BAD_SESSION_COUNT",
                "Set the session count to a number between 1 and %d.".formatted(max));
    }

    /**
     * Correcting a count to the number it already is.
     *
     * <p>Refused rather than accepted as a no-op, exactly as a zero-day
     * extension is: a trainer who came to this form meant to change something,
     * and a write that answers 200 having done nothing is how they find out
     * months later that it never took.
     */
    public static PackageRuleException noChange() {
        return new PackageRuleException(HttpStatus.BAD_REQUEST, "PACKAGE_NO_CHANGE",
                "That is the count it already has.");
    }

    /**
     * A corrected total below what has already been delivered.
     *
     * <p>Named rather than clamped to zero. Two things can be wrong here — the
     * trainer is correcting the wrong pack, or the diary has sessions on it that
     * did not happen — and both need looking at; a `sessions_remaining` quietly
     * floored at zero would hide either one.
     */
    public static PackageRuleException fewerThanDelivered(int used) {
        return new PackageRuleException(HttpStatus.CONFLICT, "PACKAGE_FEWER_THAN_DELIVERED",
                "%d session%s already been delivered on this pack, so it cannot be corrected to fewer."
                        .formatted(used, used == 1 ? " has" : "s have"));
    }

    /**
     * There is no count to correct.
     *
     * <p>A monthly pack is time, not sessions — {@code sessions_total} is null
     * on it by construction in {@code createPackage} — so the verb does not
     * apply. {@code extend} is the one that does.
     */
    public static PackageRuleException notCounted() {
        return new PackageRuleException(HttpStatus.CONFLICT, "PACKAGE_NOT_COUNTED",
                "That pack does not count sessions. Give it more time instead.");
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

    /* ── V8 · write-offs, bills and the settle date ───────────────────────── */

    /**
     * A collected payment cannot be written off. Money that arrived was not
     * forgiven; a wrong entry is corrected by deleting it, not by relabelling it.
     */
    public static PackageRuleException alreadyCollected() {
        return new PackageRuleException(HttpStatus.CONFLICT, "ALREADY_COLLECTED",
                "This one has already been collected, so there is nothing to write off.");
    }

    /** Neither billed nor confirmed: its amount is already counted as forgiven. */
    public static PackageRuleException writtenOff() {
        return new PackageRuleException(HttpStatus.CONFLICT, "WRITTEN_OFF",
                "This one was written off. There is nothing to bill for.");
    }

    /** The gym is the collector of record and raises its own receipt. */
    public static PackageRuleException gymCollected() {
        return new PackageRuleException(HttpStatus.CONFLICT, "GYM_COLLECTED",
                "The gym collected this one and raises its own receipt. Invoices here are "
                        + "for the clients you collect from yourself.");
    }

    /** The bill prints <i>Paid on</i>; a pending row has no such date to print. */
    public static PackageRuleException notPaid() {
        return new PackageRuleException(HttpStatus.CONFLICT, "NOT_PAID",
                "This one hasn't been paid yet. Mark it paid first, then raise the invoice.");
    }

    public static PackageRuleException paidInFuture() {
        return new PackageRuleException(HttpStatus.BAD_REQUEST, "VALIDATION",
                "paidAt: that date is in the future.");
    }

    public static PackageRuleException reasonTooLong(int max) {
        return new PackageRuleException(HttpStatus.BAD_REQUEST, "VALIDATION",
                "reason: at most " + max + " characters.");
    }

    /* ── 404: as far as this trainer is concerned, it is not there ─────────── */

    public static PackageRuleException paymentNotFound() {
        return new PackageRuleException(HttpStatus.NOT_FOUND, "PAYMENT_NOT_FOUND",
                "That payment is not on your books.");
    }

    public static PackageRuleException notFound() {
        return new PackageRuleException(HttpStatus.NOT_FOUND, "PACKAGE_NOT_FOUND",
                "That package is not on your books.");
    }

    public static PackageRuleException clientNotFound() {
        return new PackageRuleException(HttpStatus.NOT_FOUND, "CLIENT_NOT_FOUND",
                "That client is not on your roster.");
    }
}
