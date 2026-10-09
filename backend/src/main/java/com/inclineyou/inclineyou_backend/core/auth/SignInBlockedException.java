package com.inclineyou.inclineyou_backend.core.auth;

import lombok.Getter;

import java.time.Duration;

/**
 * An address (or the day's budget for new numbers) is refused outright.
 *
 * Not {@link OtpThrottledException}: a throttle is "wait 30 seconds, this number is
 * fine"; this is "stop", with a wait measured in hours, and the screen must not
 * draw a resend countdown for it. {@code code} tells the two apart.
 */
@Getter
public class SignInBlockedException extends RuntimeException {

    public static final String BLOCKED = "SIGN_IN_BLOCKED";
    public static final String SIGNUPS_PAUSED = "SIGNUPS_PAUSED";

    private final String code;
    private final int retryAfterSeconds;

    public SignInBlockedException(String code, String message, Duration wait) {
        super(message);
        this.code = code;
        this.retryAfterSeconds = (int) Math.max(1, wait.toSeconds());
    }
}
