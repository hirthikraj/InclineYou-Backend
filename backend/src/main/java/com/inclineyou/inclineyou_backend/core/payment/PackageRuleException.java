package com.inclineyou.inclineyou_backend.core.payment;

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

    /* ── 409: well-formed, and the state says no ───────────────────────────── */

    /* ── V8 · write-offs, bills and the settle date ───────────────────────── */

    /** Neither billed nor confirmed: its amount is already counted as forgiven. */
    public static PackageRuleException writtenOff() {
        return new PackageRuleException(HttpStatus.CONFLICT, "WRITTEN_OFF",
                "This one was written off. There is nothing to bill for.");
    }

    /* ── 404: as far as this trainer is concerned, it is not there ─────────── */

    public static PackageRuleException notFound() {
        return new PackageRuleException(HttpStatus.NOT_FOUND, "PACKAGE_NOT_FOUND",
                "That package is not on your books.");
    }

    /**
     * Renew refused: the pack was already renewed — the client holds a newer
     * running, unpaused pack for the same service — so a double click cannot
     * sell two. api-contract Today A3; 1.1 named the code for what it means.
     */
    public static PackageRuleException alreadyRenewed() {
        return new PackageRuleException(HttpStatus.CONFLICT, "PACKAGE_ALREADY_RENEWED",
                "This pack was already renewed — a newer pack for the same service is running.");
    }
}
