package com.xrep.xrep_backend.auth;

import lombok.Getter;

/**
 * Too many codes, too fast — and nothing to do with getting one wrong.
 *
 * Deliberately not {@link OtpLockedException}, even though both answer 429. A
 * lock is three wrong codes on this number and has its own screen with a
 * countdown; a throttle is simply a send rate, stays on the phone-entry screen,
 * and costs the trainer nothing but a wait. The app tells them apart on the
 * {@code code} property rather than the status, so the two must not share one.
 *
 * Nothing is consumed by this: no code is generated, no SMS is sent, no row is
 * written. It is a refusal to spend money on somebody hammering a number.
 */
@Getter
public class OtpThrottledException extends RuntimeException {

    private final int retryAfterSeconds;

    public OtpThrottledException(int retryAfterSeconds) {
        super("Too many codes requested for this number");
        this.retryAfterSeconds = retryAfterSeconds;
    }
}
