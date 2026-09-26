package com.inclineyou.inclineyou_backend.trainer;

import lombok.Getter;
import org.springframework.http.HttpStatus;

/**
 * An account rule said no — changing a number, or closing the account.
 *
 * <p>The shape {@code PackRuleException} and {@code TeamRuleException} already
 * established, and here for the reason the first of those spells out at length:
 * a {@code ResponseStatusException} serialises through the servlet error page as
 * {@code {timestamp, status, error, path}}, so the sentence reaches the log and
 * never the trainer.
 *
 * <p>That matters more on this screen than on any other in the product. Every
 * refusal below is a fact the trainer has to act on and cannot guess at — the
 * number is somebody else's, the code has expired, the confirmation does not
 * match — and "that didn't work" in place of any of them turns a two-minute
 * change into a support conversation. A screen cannot invent
 * <i>"That number already belongs to an InclineYou account"</i> from a bare 400.
 *
 * <h2>Codes, and what the web branches on</h2>
 *
 * <p>{@code code} is the machine-readable half and {@code detail} the sentence.
 * The web reads {@code detail} first and falls back to its own copy — see
 * {@code lib/account/actions.ts} — so a code added here without a matching
 * branch there still shows the trainer something true.
 */
@Getter
public class AccountRuleException extends RuntimeException {

    private final String code;
    private final HttpStatus status;

    public AccountRuleException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    /* ── the number being taken ────────────────────────────────────────────── */

    /**
     * The new number is the number they are already on.
     *
     * <p>Named rather than accepted as a no-op. Sending a code to somebody's own
     * number and then telling them the change succeeded would leave them
     * believing they had moved.
     */
    public static AccountRuleException samePhone() {
        return new AccountRuleException(HttpStatus.BAD_REQUEST, "PHONE_UNCHANGED",
                "That is the number you are already signed in with.");
    }

    /**
     * Somebody already holds it.
     *
     * <p>Deliberately does not say WHO, or even whether it is a trainer or
     * somebody's client: this endpoint would otherwise answer "is this number on
     * InclineYou" for any number in India, one request at a time. The trainer who owns
     * the number knows which of their own accounts it is; a stranger probing
     * learns only that they cannot have it.
     */
    public static AccountRuleException phoneTaken() {
        return new AccountRuleException(HttpStatus.CONFLICT, "PHONE_TAKEN",
                "That number already belongs to an InclineYou account. "
                        + "If it is yours, sign in with it — an account cannot be moved onto another one.");
    }

    /* ── the contact address ───────────────────────────────────────────────
     * Thrown from `TrainerService`, not from `AccountService`, because `email`
     * rides the profile PATCH like every other column — and it is here anyway,
     * because it is the ACCOUNT screen's field and because these two are the
     * only refusals on that endpoint whose sentence actually reaches the
     * trainer. Everything else on `/v1/trainers/me` throws
     * `ResponseStatusException` and loses its `detail` to the servlet error
     * page, which is a pre-existing gap this pass did not widen and did not
     * close: `headline`, `bio` and `gymSharePercent` all still answer a bare
     * 400. Worth moving them the same way next time one of them is touched.
     * -------------------------------------------------------------------- */

    public static AccountRuleException emailTooLong(int max) {
        return new AccountRuleException(HttpStatus.BAD_REQUEST, "EMAIL_TOO_LONG",
                "That address is longer than " + max + " characters, which is longer than an "
                        + "address can be.");
    }

    /**
     * Not an address at all.
     *
     * <p>The wording avoids claiming the address does not EXIST, because nothing
     * here can know that: the only check that settles an address is sending to
     * it, and this service cannot send. What it can say is that the string is
     * not shaped like one.
     */
    public static AccountRuleException emailNotAnAddress() {
        return new AccountRuleException(HttpStatus.BAD_REQUEST, "EMAIL_INVALID",
                "That doesn’t look like an email address.");
    }

    /**
     * A gender id the product does not have — V6.
     *
     * <p>Typed rather than a bare 400 for the reason the block above gives: it
     * is the one answer setup step 1 now refuses to go on without, and a step
     * that silently will not advance is the failure that made the column.
     */
    public static AccountRuleException genderUnknown() {
        return new AccountRuleException(HttpStatus.BAD_REQUEST, "VALIDATION",
                "gender: must be one of woman, man, nonbinary, undisclosed");
    }

    /* ── the proof ─────────────────────────────────────────────────────────── */

    /**
     * No ticket, a forged one, or one that has aged out.
     *
     * <p>401 rather than 400: what is missing is a proof, and the recovery is to
     * prove it again rather than to fix the request. The sentence says which
     * step to go back to, because "unauthorized" on a screen the trainer is
     * demonstrably signed in to reads as a bug.
     */
    public static AccountRuleException proveCurrentFirst() {
        return new AccountRuleException(HttpStatus.UNAUTHORIZED, "PHONE_CHANGE_UNPROVEN",
                "Confirm your current number again — that step timed out.");
    }

    /* ── closing the account ───────────────────────────────────────────────── */

    /**
     * The typed confirmation is not this trainer's number.
     *
     * <p>The confirmation is the whole safety mechanism on a soft delete that
     * cannot be undone from inside the product, so a mismatch is refused loudly
     * rather than treated as an empty field.
     */
    public static AccountRuleException confirmationMismatch() {
        return new AccountRuleException(HttpStatus.BAD_REQUEST, "DELETE_NOT_CONFIRMED",
                "That is not the number on this account. Type it exactly to confirm.");
    }
}
