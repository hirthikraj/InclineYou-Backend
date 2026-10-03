package com.inclineyou.inclineyou_backend.core.auth;

import com.inclineyou.inclineyou_backend.infrastructure.config.AppProperties;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.UUID;

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
    private final OtpRequestLedger ledger;
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

    /** A code that went out: the id to come back with, when it dies, and when another may be asked for. */
    public record Issued(UUID requestId, Instant expiresAt, int resendAfterSeconds) {}

    /** What the "Didn't get it?" screen shows for one request. */
    public record Delivery(String status, String error, Instant expiresAt) {}

    /**
     * Issue a code for {@code purpose} ({@link OtpRequest#SIGN_IN},
     * {@link OtpRequest#CHANGE_PHONE_OLD}, {@link OtpRequest#CHANGE_PHONE_NEW}).
     *
     * <p>Throttling comes first and costs nothing: a refused send writes no row,
     * stores no code and dispatches nothing.
     */
    public Issued send(String phone, String purpose) {
        Instant now = Instant.now();
        requireUnlocked(phone, now);
        limiter.check(phone, now);
        String otp = String.format("%06d", secureRandom.nextInt(1_000_000));
        Instant expiresAt = now.plusSeconds(props.getOtp().getExpiryMinutes() * 60L);
        String hash = bcrypt.encode(otp);
        OtpRequest request = ledger.open(phone, purpose, hash, expiresAt);
        store.saveCode(phone, hash, expiresAt);
        store.recordSend(phone, now);
        try {
            sender.send(phone, otp);
        } catch (RuntimeException e) {
            // The request exists and nothing will ever arrive for it: say so on the row, so the screen polling it can offer the second path, then let the failure through as it always did.
            ledger.failed(request.getId(), "provider_error");
            throw e;
        }
        ledger.sent(request.getId());
        return new Issued(request.getId(), expiresAt, limiter.resendAfterSeconds(phone, now));
    }

    /**
     * The delivery state of a sign-in request, for whoever holds its id.
     *
     * @throws ApiException 404 {@code OTP_REQUEST_NOT_FOUND} — unknown, expired or superseded
     */
    public Delivery delivery(UUID requestId) {
        OtpRequest r = openSignIn(requestId);
        if (r.getExpiresAt().isBefore(Instant.now())) throw requestNotFound();
        return new Delivery(r.getDeliveryStatus(), r.getDeliveryError(), r.getExpiresAt());
    }

    /**
     * Check a sign-in code against the request it was sent for.
     *
     * @return the number the request was for — the caller never sent one
     * @throws ApiException         404 {@code OTP_REQUEST_NOT_FOUND}
     * @throws OtpLockedException   the number is serving a wait
     * @throws OtpExpiredException  the request has aged out
     * @throws InvalidOtpException  wrong; always carries attemptsLeft
     */
    public String verifyRequest(UUID requestId, String otp) {
        OtpRequest r = openSignIn(requestId);
        String phone = r.getPhone();
        check(phone, otp, Instant.now(), r.getExpiresAt());
        ledger.consume(requestId);
        return phone;
    }

    /** A request that exists, is for sign-in and has not been used or superseded. */
    private OtpRequest openSignIn(UUID requestId) {
        return ledger.find(requestId)
                .filter(r -> OtpRequest.SIGN_IN.equals(r.getPurpose()))
                .filter(r -> r.getConsumedAt() == null)
                .orElseThrow(OtpService::requestNotFound);
    }

    public static ApiException requestNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "OTP_REQUEST_NOT_FOUND",
                "That sign-in request is unknown, expired or superseded.");
    }

    /**
     * @throws OtpLockedException   too many wrong attempts; carries the wait
     * @throws OtpExpiredException  aged out, or there is no live code
     * @throws InvalidOtpException  wrong; always carries attemptsLeft
     */
    public void verify(String phone, String otp) {
        check(phone, otp, Instant.now(), null);
    }

    /** The sequence both entry points share; {@code requestExpiry} is the request's own, when there is one. */
    private void check(String phone, String otp, Instant now, Instant requestExpiry) {
        // 1. Is this number serving a wait?
        requireUnlocked(phone, now);

        // 2. The live code, if there is one.
        OtpStore.Code code = store.activeCode(phone).orElse(null);
        if (code == null || code.expiresAt().isBefore(now)
                || (requestExpiry != null && requestExpiry.isBefore(now))) {
            throw new OtpExpiredException();
        }

        // 3. Check it.
        if (!bcrypt.matches(otp, code.hash())) {
            int used = store.recordWrongAttempt(phone);
            int maxAttempts = props.getOtp().getMaxAttempts();

            if (used >= maxAttempts) {
                int lockSeconds = props.getOtp().getLockMinutes() * 60;
                store.lock(phone, now.plusSeconds(lockSeconds));
                throw new OtpLockedException(lockSeconds);
            }
            throw new InvalidOtpException(maxAttempts - used);
        }

        // 4. Spent. A verified code must never work twice (AUTH-29).
        store.consume(phone);
    }
}
