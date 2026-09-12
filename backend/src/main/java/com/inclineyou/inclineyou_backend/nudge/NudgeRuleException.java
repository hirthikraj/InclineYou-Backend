package com.inclineyou.inclineyou_backend.nudge;

import lombok.Getter;
import org.springframework.http.HttpStatus;

/**
 * A nudge rule said no.
 *
 * <p>Same shape as {@code PackRuleException} and {@code TeamRuleException}, and
 * the same reason for existing rather than reaching for {@code
 * ResponseStatusException}: this backend sets no {@code
 * spring.mvc.problemdetails.enabled}, so a {@code ResponseStatusException}
 * serialises through the servlet error page as {@code {timestamp, status, error,
 * path}} and the sentence reaches the log and nothing else. Every refusal here
 * has a cause the trainer can act on, and a screen that answers it with "that did
 * not go through" has thrown the useful half of the response away.
 *
 * <h2>What is deliberately NOT in here</h2>
 *
 * <p>There is no {@code TOO_SOON}. The once-per-client-per-seven-days cooldown is
 * real and it is enforced — but it is enforced by the SCREEN going quiet, not by
 * the server refusing a button. See {@link NudgeService} for the argument; the
 * short version is that a trainer who has explicitly pressed *Remind* on a client
 * they messaged on Monday is telling the product something it does not know, and
 * a product that answers that with a refusal is a product they route around by
 * opening WhatsApp directly — which is the one outcome that loses the log.
 */
@Getter
public class NudgeRuleException extends RuntimeException {

    private final String code;
    private final HttpStatus status;

    public NudgeRuleException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    /* ── 400 ──────────────────────────────────────────────────────────────── */

    public static NudgeRuleException unknownTemplate(String name) {
        return new NudgeRuleException(HttpStatus.BAD_REQUEST, "NUDGE_TEMPLATE_UNKNOWN",
                "There is no template called \"%s\".".formatted(name));
    }

    /**
     * An empty override is a DELETE, not a save. Saying so rather than storing
     * it: a stored empty body sends an empty WhatsApp, and the trainer who
     * cleared the box was reaching for "put the default back".
     */
    public static NudgeRuleException emptyBody() {
        return new NudgeRuleException(HttpStatus.BAD_REQUEST, "NUDGE_TEMPLATE_EMPTY",
                "A template needs some words in it. Clear it and reset it to go back to the default.");
    }

    /**
     * WhatsApp's own ceiling on a pre-filled {@code wa.me} body is well past
     * this; the limit here is about the message rather than the protocol. A
     * reminder nobody reads to the end is a reminder that did not work.
     */
    public static NudgeRuleException bodyTooLong(int limit) {
        return new NudgeRuleException(HttpStatus.BAD_REQUEST, "NUDGE_TEMPLATE_TOO_LONG",
                "Keep it under %d characters — a long reminder does not get read.".formatted(limit));
    }

    /* ── 404: as far as this trainer is concerned, it is not there ─────────── */

    /**
     * The standing convention: ownership is a query filter, and a 404 exists so a
     * trainer cannot confirm another trainer's row is real by probing for its id.
     */
    public static NudgeRuleException clientNotFound() {
        return new NudgeRuleException(HttpStatus.NOT_FOUND, "NUDGE_CLIENT_NOT_FOUND",
                "That client is no longer on your roster.");
    }

    /**
     * A client with no number on file. 422 rather than 400: the request is
     * well-formed and asks for something that cannot exist, which is the same
     * reading {@code TeamRuleException} uses.
     */
    public static NudgeRuleException noPhone(String clientName) {
        return new NudgeRuleException(HttpStatus.UNPROCESSABLE_CONTENT, "NUDGE_NO_PHONE",
                "%s has no phone number on file, so there is nowhere to send this."
                        .formatted(clientName == null ? "That client" : clientName));
    }
}
