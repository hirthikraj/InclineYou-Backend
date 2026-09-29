package com.inclineyou.inclineyou_backend.core.auth;

import lombok.Getter;

/**
 * A wrong code against a live request — and only that. Expiry is
 * {@link OtpExpiredException} and the wall is {@link OtpLockedException}, so an
 * attempt has always just been spent and counted by the time this is thrown.
 */
@Getter
public class InvalidOtpException extends RuntimeException {

    /** Attempts still available on this request. Never below 1 — at 0 the number locks instead. */
    private final int attemptsLeft;

    public InvalidOtpException(int attemptsLeft) {
        super("That code doesn't match");
        this.attemptsLeft = attemptsLeft;
    }
}
