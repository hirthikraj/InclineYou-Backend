package com.inclineyou.inclineyou_backend.auth;

import lombok.Getter;

@Getter
public class OtpLockedException extends RuntimeException {

    private final int retryAfterSeconds;

    public OtpLockedException(int retryAfterSeconds) {
        super("Too many failed OTP attempts — sign-in paused");
        this.retryAfterSeconds = retryAfterSeconds;
    }
}
