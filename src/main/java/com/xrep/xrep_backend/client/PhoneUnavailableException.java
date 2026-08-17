package com.xrep.xrep_backend.client;

import lombok.Getter;

/**
 * A number that cannot go on this trainer's roster.
 *
 * Carries a machine-readable {@code code} as well as the sentence, because the
 * two failures behind it have different recoveries — one is "use a different
 * number", the other is "they have to leave that roster first" — and an app
 * that only had the prose would have to match on it to tell them apart.
 *
 * @see ClientPhoneGuard
 */
@Getter
public class PhoneUnavailableException extends RuntimeException {

    private final String code;

    public PhoneUnavailableException(String code, String message) {
        super(message);
        this.code = code;
    }
}
