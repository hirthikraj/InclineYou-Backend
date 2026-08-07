package com.trainx.trainx_backend.auth;

import com.trainx.trainx_backend.entity.Trainer;
import com.trainx.trainx_backend.repository.TrainerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final TrainerRepository trainerRepo;
    private final OtpService otpService;
    private final JwtService jwtService;

    public void requestOtp(String phone) {
        otpService.send(phone);
    }

    @Transactional
    public AuthResponse verifyOtp(String phone, String otp) {
        if (!otpService.verify(phone, otp)) {
            throw new InvalidOtpException();
        }

        Optional<Trainer> existing = trainerRepo.findByPhoneAndDeletedAtIsNull(phone);
        boolean isNew = existing.isEmpty();

        Trainer trainer;
        if (isNew) {
            Trainer t = new Trainer();
            t.setPhone(phone);
            t.setName(phone); // placeholder — trainer completes profile after first login
            trainer = trainerRepo.save(t);
        } else {
            trainer = existing.get();
        }

        String token = jwtService.generate(trainer.getId(), trainer.getPhone());
        return new AuthResponse(token, trainer.getId().toString(), isNew);
    }

    public record AuthResponse(String token, String trainerId, boolean isNewUser) {}

    public static class InvalidOtpException extends RuntimeException {
        public InvalidOtpException() {
            super("OTP is invalid or has expired");
        }
    }
}
