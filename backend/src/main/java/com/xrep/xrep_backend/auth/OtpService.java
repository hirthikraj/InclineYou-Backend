package com.xrep.xrep_backend.auth;

import com.xrep.xrep_backend.config.AppProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Instant;

/**
 * Issue a code, and check one.
 *
 * The state lives behind {@link OtpStore} — Redis when it is up, `otp_request`
 * when it is not — and the send limits live in {@link OtpSendLimiter}. What is
 * left here is the sequence, which is the part worth reading in one piece:
 * a wait is checked before anything is generated, a code is hashed before it is
 * stored, and a wrong guess is counted whether or not the caller sees an error.
 *
 * ── What moving to Redis actually changed ─────────────────────────────────────
 *
 * Two things, and neither is speed.
 *
 * Expiry stopped being somebody's job. `V1__init_schema.sql` promised a
 * scheduled cleanup for `otp_request` that was never written, so the table has
 * grown since the first sign-in; a TTL cannot be forgotten.
 *
 * And the wrong-attempt counter became atomic. It used to be read-modify-write
 * under READ COMMITTED, so two verifies landing together could both read `2` and
 * both write `3` — SEC-OTP-06, a burst buying a fourth guess at a six-digit
 * code. {@code HINCRBY} makes that impossible on the fast path, and the Postgres
 * fallback now takes a row lock so it is impossible on the slow one too.
 *
 * No longer {@code @Transactional}: the store owns its own transactions where it
 * needs them, and wrapping a Redis call in a database transaction would be a lie
 * about what can be rolled back.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class OtpService {

    private final OtpStore store;
    private final OtpSendLimiter limiter;
    private final OtpSender sender;
    private final AppProperties props;
    private final BCryptPasswordEncoder bcrypt;
    private final SecureRandom secureRandom = new SecureRandom();

    /**
     * Is this number serving a wait, and if so throw it.
     *
     * This was a {@code ConcurrentHashMap} once, which made the ceiling on brute
     * force "three attempts per restart": every deploy cleared every live lock,
     * and a second instance never saw the first one's. V17 moved it onto the row;
     * it now lives in Redis with the row as a backstop, and
     * {@link DelegatingOtpStore#lockedUntil} takes the later of the two so a
     * failover never hands somebody a clean slate.
     */
    private void requireUnlocked(String phone, Instant now) {
        Instant lockedUntil = store.lockedUntil(phone);
        if (lockedUntil != null && lockedUntil.isAfter(now)) {
            throw new OtpLockedException(OtpSendLimiter.secondsUntil(now, lockedUntil));
        }
    }

    public void send(String phone) {
        Instant now = Instant.now();

        requireUnlocked(phone, now);

        // Before anything is generated or sent: a refused request must cost nothing, least of all an SMS.
        limiter.check(phone, now);

        String otp = String.format("%06d", secureRandom.nextInt(1_000_000));
        Instant expiresAt = now.plusSeconds(props.getOtp().getExpiryMinutes() * 60L);

        // Hashed, never stored in the clear — the store is a cache to everything that can read it, and a readable code is a readable account.
        store.saveCode(phone, bcrypt.encode(otp), expiresAt);
        store.recordSend(phone, now);
        sender.send(phone, otp);
    }

    /**
     * @throws OtpLockedException   too many wrong attempts; carries the wait
     * @throws OtpExpiredException  aged out, or there is no live code
     * @throws InvalidOtpException  wrong; always carries attemptsLeft
     */
    public void verify(String phone, String otp) {
        Instant now = Instant.now();

        // 1. Is this number serving a wait?
        requireUnlocked(phone, now);

        // 2. The live code, if there is one.
        OtpStore.Code code = store.activeCode(phone).orElse(null);
        if (code == null || code.expiresAt().isBefore(now)) {
            throw new OtpExpiredException();
        }

        // 3. Check it.
        if (!bcrypt.matches(otp, code.hash())) {
            int used = store.recordWrongAttempt(phone);

            int maxAttempts = props.getOtp().getMaxAttempts();
            int lockSeconds = props.getOtp().getLockMinutes() * 60;

            if (used >= maxAttempts) {
                store.lock(phone, now.plusSeconds(lockSeconds));
                throw new OtpLockedException(lockSeconds);
            }
            throw new InvalidOtpException(maxAttempts - used);
        }

        // 4. Spent. A verified code must never work twice (AUTH-29).
        store.consume(phone);
    }
}
