package com.trainx.trainx_backend.auth;

import com.trainx.trainx_backend.config.AppProperties;
import com.trainx.trainx_backend.entity.OtpRequest;
import com.trainx.trainx_backend.repository.OtpRequestRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Instant;

@Service
@RequiredArgsConstructor
@Slf4j
public class OtpService {

    private final OtpRequestRepository otpRepo;
    private final AppProperties props;
    private final BCryptPasswordEncoder bcrypt;
    private final SecureRandom secureRandom = new SecureRandom();

    @Transactional
    public void send(String phone) {
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

    @Transactional
    public boolean verify(String phone, String otp) {
        OtpRequest req = otpRepo.findLatestUnverified(phone).orElse(null);
        if (req == null || req.getExpiresAt().isBefore(Instant.now())) {
            return false;
        }
        if (!bcrypt.matches(otp, req.getOtpHash())) {
            return false;
        }
        req.setVerified(true);
        otpRepo.save(req);
        return true;
    }
}
