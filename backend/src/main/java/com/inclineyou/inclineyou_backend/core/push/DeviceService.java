package com.inclineyou.inclineyou_backend.core.push;

import com.inclineyou.inclineyou_backend.core.push.dto.RegisterTokenBody;
import com.inclineyou.inclineyou_backend.core.trainer.TrainerRepository;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * Which device a trainer's pushes go to: the app registers its native FCM token after every sign-in and on every token
 * refresh, and clears it on sign-out. One token per trainer — a second phone replaces the first. Sending is
 * {@link PushService}'s.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class DeviceService {

    private final TrainerRepository trainers;

    @Transactional
    public void register(UUID trainerId, RegisterTokenBody body) {
        var trainer = trainers.findById(trainerId).orElseThrow(() -> ApiException.notFound("Trainer not found"));
        trainer.setFcmToken(body.token().strip());
        trainers.save(trainer);
        log.debug("registered {} push token for trainer {}", body.platform(), trainerId);
    }

    /** Idempotent: a trainer with no token, or no row, is already unregistered. */
    @Transactional
    public void unregister(UUID trainerId) {
        trainers.findById(trainerId).ifPresent(t -> {
            t.setFcmToken(null);
            trainers.save(t);
        });
    }
}
