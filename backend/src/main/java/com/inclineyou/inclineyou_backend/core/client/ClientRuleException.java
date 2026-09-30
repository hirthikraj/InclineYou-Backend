package com.inclineyou.inclineyou_backend.core.client;

import lombok.Getter;
import org.springframework.http.HttpStatus;

/**
 * A rule about a client's file said no — a birth date that cannot be one, a
 * note with no text.
 *
 * <p>The {@code PackRuleException} / {@code AccountRuleException} shape, and for
 * their reason: this service sets no {@code spring.mvc.problemdetails.enabled},
 * so a {@code ResponseStatusException} serialises through the servlet error
 * page as {@code {timestamp, status, error, path}} and its sentence never
 * reaches the trainer. The client file prints {@code detail} verbatim, so a
 * refusal with no sentence is a Save button that silently does nothing.
 *
 * <p>The phone-number refusals are NOT here — they are
 * {@link PhoneUnavailableException}, whose two codes predate this class and are
 * in the app's catalogue.
 */
@Getter
public class ClientRuleException extends RuntimeException {

    private final String code;
    private final HttpStatus status;

    public ClientRuleException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public static ClientRuleException validation(String message) {
        return new ClientRuleException(HttpStatus.BAD_REQUEST, "VALIDATION", message);
    }

    /** {@code POST /v1/clients/{id}/delete}: the typed name doesn't match — the mis-tap guard. */
    public static ClientRuleException deleteNotConfirmed() {
        return new ClientRuleException(HttpStatus.BAD_REQUEST, "CLIENT_DELETE_NOT_CONFIRMED",
                "That isn't their name — type it exactly to confirm.");
    }
}
