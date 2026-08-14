package com.xrep.xrep_backend.auth;

import com.xrep.xrep_backend.config.AppProperties;
import com.xrep.xrep_backend.entity.OtpRequest;
import com.xrep.xrep_backend.repository.OtpRequestRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class OtpService {

    private final OtpRequestRepository otpRepo;
    private final AppProperties props;
    private final BCryptPasswordEncoder bcrypt;
    private final SecureRandom secureRandom = new SecureRandom();

    /**
     * Is this number serving a wait, and if so throw it.
     *
     * This used to be a {@code ConcurrentHashMap} field, which made the ceiling
     * on brute force "three attempts per restart": every deploy cleared every
     * live lock, and a second instance never saw the first one's. It is now
     * {@code otp_request.locked_until} (V17), so it survives both.
     *
     * A lock in the past needs no cleanup — it is simply over. The map needed
     * pruning; a timestamp does not.
     */
    private void requireUnlocked(String phone, Instant now) {
        Instant lockedUntil = otpRepo.lockedUntilFor(phone);
        if (lockedUntil != null && lockedUntil.isAfter(now)) {
            throw new OtpLockedException(secondsUntil(now, lockedUntil));
        }
    }

    @Transactional
    public void send(String phone) {
        Instant now = Instant.now();

        requireUnlocked(phone, now);

        // Before anything is generated or sent: a refused request must cost
        // nothing, least of all an SMS.
        throttle(phone, now);

        String otp = String.format("%06d", secureRandom.nextInt(1_000_000));

        OtpRequest req = new OtpRequest();
        req.setPhone(phone);
        req.setOtpHash(bcrypt.encode(otp));
        req.setExpiresAt(Instant.now().plusSeconds(props.getOtp().getExpiryMinutes() * 60L));
        otpRepo.save(req);

        if (props.getOtp().isSmsEnabled()) {
            // TODO: integrate SMS provider (MSG91 or Firebase Auth)
        } else {
            log.info("[DEV] OTP for {}: {}", phone, otp);
        }
    }

    /**
     * How many codes a number may ask for, and how fast.
     *
     * {@code maxAttempts} caps guesses at a code. This caps the codes themselves,
     * which is the other half and the expensive one: with SMS stubbed, an
     * unlimited request rate is a log full of codes, and the day a provider is
     * wired it is somebody else's phone buzzing all night on our bill.
     *
     * Two limits, and the day's ceiling is checked first — when both apply it is
     * the longer wait, and quoting the 30-second one would be a promise the next
     * request breaks.
     *
     * Counted from {@code otp_request} rather than a field: every code ever sent
     * is already a row there, so the limit survives a deploy and holds across
     * instances — the same reason the lock moved onto the row in V17.
     *
     * Two requests landing in the same millisecond can both read the same count
     * and both pass — READ COMMITTED, no row to lock. The window is a millisecond
     * wide and the daily ceiling still bounds the total, so the worst case is one
     * extra text, not an unbounded run.
     */
    private void throttle(String phone, Instant now) {
        var otp = props.getOtp();

        Instant dayAgo = now.minus(Duration.ofHours(24));
        if (otpRepo.countSentSince(phone, dayAgo) >= otp.getMaxSendsPerDay()) {
            // The count falls back under the ceiling the moment the oldest of
            // those sends ages out of the rolling day.
            Instant oldest = otpRepo.oldestSentSince(phone, dayAgo);
            Instant freeAt = (oldest == null ? now : oldest).plus(Duration.ofHours(24));
            log.warn("OTP send refused for {}: {} in 24h", phone, otp.getMaxSendsPerDay());
            throw new OtpThrottledException(secondsUntil(now, freeAt));
        }

        List<Integer> ladder = otp.getResendLadderSeconds();
        if (ladder == null || ladder.isEmpty()) return;

        Instant windowStart = now.minus(Duration.ofMinutes(otp.getSendWindowMinutes()));
        long sentInWindow = otpRepo.countSentSince(phone, windowStart);
        // The first code inside a window never waits — that is somebody signing
        // in, not somebody hammering.
        if (sentInWindow == 0) return;

        Instant lastSent = otpRepo.lastSentAt(phone);
        if (lastSent == null) return;

        int step = (int) Math.min(sentInWindow, ladder.size()) - 1;
        Instant readyAt = lastSent.plusSeconds(ladder.get(step));
        if (readyAt.isAfter(now)) {
            throw new OtpThrottledException(secondsUntil(now, readyAt));
        }
    }

    /** Rounded up, and never 0 — "retry after 0 seconds" reads as "retry now". */
    private static int secondsUntil(Instant now, Instant when) {
        long millis = Duration.between(now, when).toMillis();
        return (int) Math.max(1, (millis + 999) / 1000);
    }

    /**
     * Verifies the OTP for the given phone number.
     *
     * @throws OtpLockedException   if the phone is locked due to too many wrong attempts
     * @throws OtpExpiredException  if the code has aged out, or there is no live code
     * @throws InvalidOtpException  if the code is wrong (always carries attemptsLeft)
     */
    // REQUIRES_NEW: suspends the caller's transaction so this one commits on its
    // own, even when an exception follows. Without it, the outer @Transactional on
    // AuthService.verifyOtp() rolls back the shared transaction on RuntimeException,
    // discarding the wrongAttempts increment before it ever reaches the DB.
    @Transactional(propagation = Propagation.REQUIRES_NEW,
                   noRollbackFor = {InvalidOtpException.class, OtpExpiredException.class,
                                    OtpLockedException.class})
    public void verify(String phone, String otp) {
        Instant now = Instant.now();

        // 1. Is this number serving a wait? Read from the row, not from memory.
        requireUnlocked(phone, now);

        // 2. Find the active (unexpired, unverified) OTP for this number.
        OtpRequest req = otpRepo.findLatestUnverified(phone).orElse(null);
        if (req == null || req.getExpiresAt().isBefore(now)) {
            // Its own failure, not a wrong code: the recovery is "send a new one",
            // not "retype", and it must not burn an attempt. Note this returns
            // before the counter below ever runs.
            throw new OtpExpiredException();
        }

        // 3. Check the code.
        if (!bcrypt.matches(otp, req.getOtpHash())) {
            int newCount = req.getWrongAttempts() + 1;
            req.setWrongAttempts(newCount);

            int maxAttempts = props.getOtp().getMaxAttempts();
            int lockSeconds = props.getOtp().getLockMinutes() * 60;
            boolean locking = newCount >= maxAttempts;
            // Stamped on the same row and in the same save as the count that
            // caused it, so the wait and its reason commit together or not at
            // all. REQUIRES_NEW above is what gets them committed at all.
            if (locking) req.setLockedUntil(now.plusSeconds(lockSeconds));
            otpRepo.save(req);

            if (locking) throw new OtpLockedException(lockSeconds);
            throw new InvalidOtpException(maxAttempts - newCount);
        }

        req.setVerified(true);
        otpRepo.save(req);
    }
}
