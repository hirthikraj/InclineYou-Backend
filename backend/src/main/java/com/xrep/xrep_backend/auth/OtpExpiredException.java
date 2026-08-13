package com.xrep.xrep_backend.auth;

/**
 * The code is past its TTL, or there is no live code for this number at all.
 *
 * Deliberately NOT an {@link InvalidOtpException}: a wrong code and a stale one
 * need different recoveries — retype vs. request a new one — and an expired code
 * must never consume one of the wrong-code attempts, because nobody did anything
 * wrong. The client renders this as state 3b, in amber rather than red.
 *
 * "No live code" collapses into the same state on purpose: whether the code aged
 * out, was already spent, or was never sent, the way forward is the same and the
 * server should not help someone probe which of those it was.
 */
public class OtpExpiredException extends RuntimeException {

    public OtpExpiredException() {
        super("That code has expired — request a new one");
    }
}
