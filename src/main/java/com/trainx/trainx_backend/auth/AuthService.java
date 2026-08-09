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
        // Throws OtpLockedException, OtpExpiredException or InvalidOtpException
        // on failure — each surfaces as its own HTTP response via
        // GlobalExceptionHandler, because each needs a different recovery.
        otpService.verify(phone, otp);

        Optional<Trainer> existing = trainerRepo.findByPhoneAndDeletedAtIsNull(phone);
        boolean isNew = existing.isEmpty();

        Trainer trainer;
        if (isNew) {
            Trainer t = new Trainer();
            t.setPhone(phone);
            // `name` is NOT NULL and we have nothing else yet — sign-in gives us
            // a phone number and nothing more. Trainer setup overwrites it, and
            // `setupComplete` below is what tells the app the name is a stand-in.
            t.setName(phone);
            trainer = trainerRepo.save(t);
        } else {
            trainer = existing.get();
        }

        String token = jwtService.generate(trainer.getId(), trainer.getPhone());
        return new AuthResponse(
                token,
                trainer.getId().toString(),
                isNew,
                trainer.getSetupCompletedAt() != null);
    }

    /**
     * `isNewUser` only ever answers "is this the first verify for this number".
     * `setupComplete` answers the question the app actually has — whether a
     * profile exists — and survives a reinstall, a second device, and a flow
     * abandoned halfway. New field, so an older app simply ignores it.
     */
    public record AuthResponse(
            String token,
            String trainerId,
            boolean isNewUser,
            boolean setupComplete
    ) {}
}
