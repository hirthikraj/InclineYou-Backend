package com.inclineyou.inclineyou_backend.core.auth;

import com.inclineyou.inclineyou_backend.core.auth.OtpRequest;
import com.inclineyou.inclineyou_backend.core.auth.OtpRequestRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;

/**
 * The store that has always been here, behind the new interface.
 *
 * Unchanged in behaviour except for one thing: {@link #recordWrongAttempt} now
 * takes a row lock. That is SEC-OTP-06 — parallel verifies could read the same
 * `wrong_attempts`, both write the same increment, and a burst could buy more
 * than three guesses. The known-gaps list said this needed a pessimistic lock;
 * moving to Redis gave it one for free on the fast path, and it would be odd to
 * leave the fallback holding the bug the fast path just fixed.
 *
 * This is the path taken when Redis is switched off or unreachable, so it is not
 * dead code and must not be allowed to rot.
 */
@Component
@RequiredArgsConstructor
public class JpaOtpStore implements OtpStore {

    private final OtpRequestRepository otpRepo;

    /**
     * No-op: {@link OtpRequestLedger#open} wrote the row, and the row is the code.
     *
     * `activeCode` reads the latest open row for the number, and opening a request
     * retires the one before it, which is what makes a resend supersede (AUTH-28).
     */
    @Override
    public void saveCode(String phone, String hash, Instant expiresAt) {
        // deliberately empty — see the javadoc
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<Code> activeCode(String phone) {
        return otpRepo.findLatestUnverified(phone)
                .map(r -> new Code(r.getOtpHash(), r.getExpiresAt(), r.getWrongAttempts()));
    }

    /**
     * REQUIRES_NEW so the increment commits even though the caller is about to
     * throw. A wrong guess must be spent whether or not the response is an error
     * — that is the whole point of counting it.
     */
    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public int recordWrongAttempt(String phone) {
        OtpRequest req = otpRepo.findLatestUnverifiedForUpdate(phone).orElse(null);
        if (req == null) return 0;
        int next = req.getWrongAttempts() + 1;
        req.setWrongAttempts(next);
        otpRepo.save(req);
        return next;
    }

    @Override
    @Transactional
    public void consume(String phone) {
        otpRepo.findLatestUnverified(phone).ifPresent(req -> {
            req.setConsumedAt(Instant.now());
            otpRepo.save(req);
        });
    }

    /**
     * Stamp the lock, creating a row to carry it if there isn't one.
     *
     * The "if there isn't one" is the whole point, and it was a silent no-op
     * first: when Redis is the live store, no code row is ever written here, so
     * a lock mirrored down from {@link DelegatingOtpStore} found nothing to stamp
     * and vanished. The backstop existed in the comments and not in the database
     * — the worst kind, because it reads as covered.
     *
     * A lock-only row is deliberately born expired and unmatchable. It is not a
     * code and must never be usable as one; it exists to answer exactly one
     * question, which is {@code lockedUntilFor}.
     */
    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void lock(String phone, Instant until) {
        OtpRequest req = otpRepo.findLatestUnverified(phone).orElseGet(() -> {
            OtpRequest carrier = new OtpRequest();
            carrier.setPhone(phone);
            carrier.setPurpose(OtpRequest.SIGN_IN);
            carrier.setOtpHash(LOCK_ONLY_HASH);
            // The schema wants expires_at after created_at and consumed_at not
            // before it, so "already dead" is a second in the future on both:
            // consumed, so it is never the open code, and expired the moment
            // anybody looks.
            Instant dead = Instant.now().plusSeconds(1);
            carrier.setExpiresAt(dead);
            carrier.setConsumedAt(dead);
            return carrier;
        });
        req.setLockedUntil(until);
        otpRepo.save(req);
    }

    /**
     * A well-formed bcrypt hash of a value nobody has: it makes `matches` return
     * false cheaply rather than logging a malformed-hash warning on every check.
     */
    private static final String LOCK_ONLY_HASH =
            "$2a$10$0000000000000000000000000000000000000000000000000000";

    @Override
    @Transactional(readOnly = true)
    public Instant lockedUntil(String phone) {
        return otpRepo.lockedUntilFor(phone);
    }

    /**
     * No-op: the row written by {@link #saveCode} *is* the send record.
     *
     * Every code ever sent is already a row with a `created_at`, which is what
     * the ladder and the daily ceiling count. Redis has to keep that history
     * separately because its codes expire; here it falls out of the schema.
     */
    @Override
    public void recordSend(String phone, Instant at) {
        // deliberately empty — see the javadoc
    }

    @Override
    @Transactional(readOnly = true)
    public long countSendsSince(String phone, Instant since) {
        return otpRepo.countSentSince(phone, since);
    }

    @Override
    @Transactional(readOnly = true)
    public Instant lastSentAt(String phone) {
        return otpRepo.lastSentAt(phone);
    }

    @Override
    @Transactional(readOnly = true)
    public Instant oldestSendSince(String phone, Instant since) {
        return otpRepo.oldestSentSince(phone, since);
    }
}
