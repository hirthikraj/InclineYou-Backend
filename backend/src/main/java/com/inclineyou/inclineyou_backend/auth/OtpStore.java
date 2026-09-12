package com.inclineyou.inclineyou_backend.auth;

import java.time.Instant;
import java.util.Optional;

/**
 * Where a one-time code and its abuse counters live.
 *
 * Two implementations: {@link RedisOtpStore} is the fast path, {@link JpaOtpStore}
 * is what has always been there. {@link DelegatingOtpStore} picks between them,
 * so {@link OtpService} keeps one code path and never learns which is in use.
 *
 * ── Why this is an interface and not just "move it to Redis" ──────────────────
 *
 * The state behind these methods is not a cache. A lock is a security decision
 * that has to hold for its full ten minutes, and the daily ceiling is what stands
 * between us and somebody else's phone buzzing all night on our bill. Losing
 * either silently is worse than being slow, so "Redis is down" has to mean "ask
 * Postgres", not "allow everything".
 *
 * ── The one thing every implementation must get right ─────────────────────────
 *
 * {@link #recordWrongAttempt} returns the new count and must be **atomic**.
 * Reading, adding one and writing back is how SEC-OTP-06 happens: two verifies
 * landing together both read 2, both write 3, and a burst buys more than three
 * guesses at a six-digit code. Redis has {@code HINCRBY} for this; the JPA path
 * takes a row lock.
 */
public interface OtpStore {

    /** A live code: its hash, when it dies, and how many wrong guesses so far. */
    record Code(String hash, Instant expiresAt, int wrongAttempts) {}

    /**
     * Store a freshly issued code, replacing any previous one for this number.
     *
     * Replacing rather than appending is deliberate and matches the old
     * behaviour: only the latest code is checkable, so a resend invalidates the
     * one before it (AUTH-28).
     */
    void saveCode(String phone, String hash, Instant expiresAt);

    /** The live code for this number, or empty when there is none or it has died. */
    Optional<Code> activeCode(String phone);

    /** Atomically increment and return the new wrong-guess count. */
    int recordWrongAttempt(String phone);

    /** The code was right. It must not be usable again (AUTH-29). */
    void consume(String phone);

    /** Refuse this number until the given instant. */
    void lock(String phone, Instant until);

    /** When this number's lock lifts, or null if it is not locked. */
    Instant lockedUntil(String phone);

    /* ------------------------------------------------------------ send window
     * The record of codes SENT, which is a different question from the code
     * currently live: the ladder and the daily ceiling both count history that
     * outlives any single code.
     * -------------------------------------------------------------------------- */

    /** Note that a code went out to this number, now. */
    void recordSend(String phone, Instant at);

    /** How many codes went to this number since `since`. */
    long countSendsSince(String phone, Instant since);

    /** The most recent send, or null. Drives the escalating resend ladder. */
    Instant lastSentAt(String phone);

    /**
     * The oldest send still inside the rolling day, or null.
     *
     * This is what turns "you are over the ceiling" into "try again in four
     * hours": the count drops the moment this one ages out.
     */
    Instant oldestSendSince(String phone, Instant since);

    /** Whether this store is currently usable. False sends the caller to the fallback. */
    default boolean available() {
        return true;
    }
}
