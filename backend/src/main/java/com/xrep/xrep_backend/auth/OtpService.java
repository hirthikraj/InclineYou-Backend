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
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

@Service
@RequiredArgsConstructor
@Slf4j
public class OtpService {

    private final OtpRequestRepository otpRepo;
    private final AppProperties props;
    private final BCryptPasswordEncoder bcrypt;
    private final SecureRandom secureRandom = new SecureRandom();

    /** phone → lock expiry; in-memory, resets on restart (acceptable for MVP). */
    private final ConcurrentHashMap<String, Instant> lockMap = new ConcurrentHashMap<>();

    @Transactional
    public void send(String phone) {
        Instant lockUntil = lockMap.get(phone);
        if (lockUntil != null && lockUntil.isAfter(Instant.now())) {
            int retryAfter = (int) (lockUntil.getEpochSecond() - Instant.now().getEpochSecond());
            throw new OtpLockedException(retryAfter);
        }

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
        // 1. Check if the phone is currently locked.
        Instant lockUntil = lockMap.get(phone);
        if (lockUntil != null) {
            if (lockUntil.isAfter(Instant.now())) {
                int retryAfter = (int) (lockUntil.getEpochSecond() - Instant.now().getEpochSecond());
                throw new OtpLockedException(retryAfter);
            }
            lockMap.remove(phone); // lock expired — clean up
        }

        // 2. Find the active (unexpired, unverified) OTP for this number.
        OtpRequest req = otpRepo.findLatestUnverified(phone).orElse(null);
        if (req == null || req.getExpiresAt().isBefore(Instant.now())) {
            // Its own failure, not a wrong code: the recovery is "send a new one",
            // not "retype", and it must not burn an attempt. Note this returns
            // before the counter below ever runs.
            throw new OtpExpiredException();
        }

        // 3. Check the code.
        if (!bcrypt.matches(otp, req.getOtpHash())) {
            int newCount = req.getWrongAttempts() + 1;
            req.setWrongAttempts(newCount);
            otpRepo.save(req);

            int maxAttempts = props.getOtp().getMaxAttempts();
            if (newCount >= maxAttempts) {
                int lockSeconds = props.getOtp().getLockMinutes() * 60;
                lockMap.put(phone, Instant.now().plusSeconds(lockSeconds));
                throw new OtpLockedException(lockSeconds);
            }
            throw new InvalidOtpException(maxAttempts - newCount);
        }

        req.setVerified(true);
        otpRepo.save(req);
    }
}
