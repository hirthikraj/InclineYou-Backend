package com.inclineyou.inclineyou_backend.core.payment;

import lombok.Getter;
import org.springframework.http.HttpStatus;

/**
 * A price-list rule said no.
 *
 * <p>One exception type carrying its own status, the shape {@code
 * TeamRuleException} already established here and for the same reason: what
 * matters is a machine-readable {@code code} the client branches on, plus a
 * sentence it can print without inventing one of its own.
 *
 * <h2>Why not {@code ResponseStatusException}</h2>
 *
 * <p>Because the sentence never arrives. This backend has no
 * {@code spring.mvc.problemdetails.enabled}, so a {@code ResponseStatusException}
 * serialises through the servlet error page as
 * {@code {timestamp, status, error, path}} — the reason is in the server's log
 * and nowhere the trainer can see it. Every refusal here has a cause the trainer
 * can act on ("A pack needs a price"), and a screen that answers a specific 400
 * with "that did not go through" has thrown away the only useful part of the
 * response. {@code GlobalExceptionHandler} turns this into a {@code
 * ProblemDetail} with {@code detail} and {@code code} on it, which is what
 * `lib/packs/api.ts` reads.
 *
 * <h2>404, not 403, for another trainer's pack</h2>
 *
 * <p>The standing convention: ownership is a query filter, and 404 exists so a
 * trainer cannot confirm another trainer's row is real by probing for its id.
 * Nothing about a price list is inside a shared boundary the way a team is, so
 * the {@code TeamRuleException} carve-out does not apply — every miss here is a
 * 404.
 */
@Getter
public class PackRuleException extends RuntimeException {

    private final String code;
    private final HttpStatus status;

    public PackRuleException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    /* ── 400 ───────────────────────────────────────────────────────────────── */

    /**
     * Named rather than ignored. A caller sending {@code owner} believes it is
     * moving a pack between the two price lists; silently dropping the field
     * would let them believe it worked.
     */
    public static PackRuleException ownerImmutable() {
        return new PackRuleException(HttpStatus.BAD_REQUEST, "PACK_OWNER_IMMUTABLE",
                "A pack's owner cannot be changed — it would re-attribute every package sold from it.");
    }

    /* ── 409: well-formed, and the price list's state says no ──────────────── */

    public static PackRuleException nameTaken() {
        return new PackRuleException(HttpStatus.CONFLICT, "PACK_NAME_TAKEN",
                "You already have a pack with that name.");
    }

    /** Sold packs are archived, not deleted — {@code package.pack_id} points at them. */
    public static PackRuleException sold() {
        return new PackRuleException(HttpStatus.CONFLICT, "PACK_SOLD",
                "That pack has been sold, so it can't be deleted. Archive it instead.");
    }

    /** A state the trainer can change (set a gym name in Settings), so 409 and not 422. */
    public static PackRuleException gymNeeded() {
        return new PackRuleException(HttpStatus.CONFLICT, "GYM_PACK_NEEDS_GYM",
                "Set the gym you work at in Settings before adding a gym pack.");
    }

    /* ── 404: as far as this trainer is concerned, it is not there ─────────── */

    public static PackRuleException notFound() {
        return new PackRuleException(HttpStatus.NOT_FOUND, "PACK_NOT_FOUND",
                "That price is no longer on your list.");
    }
}
