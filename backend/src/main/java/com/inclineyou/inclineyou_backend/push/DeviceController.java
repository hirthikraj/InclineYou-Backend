package com.inclineyou.inclineyou_backend.push;

import com.inclineyou.inclineyou_backend.repository.TrainerRepository;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

import static org.springframework.http.HttpStatus.NOT_FOUND;

/**
 * Device push-token registration. The app posts its native FCM token here after
 * every sign-in and on every token refresh.
 */
@RestController
@RequestMapping("/v1/devices")
@RequiredArgsConstructor
@Slf4j
public class DeviceController {

    private final TrainerRepository trainerRepo;

    public record RegisterTokenBody(@NotBlank String token, String platform) {}

    @PostMapping("/token")
    @Transactional
    public ResponseEntity<Void> register(@RequestBody RegisterTokenBody body) {
        if (body.token() == null || body.token().isBlank()) {
            return ResponseEntity.badRequest().build();
        }

        var trainerId = currentTrainerId();
        var trainer = trainerRepo.findById(trainerId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Trainer not found"));

        trainer.setFcmToken(body.token());
        trainerRepo.save(trainer);
        log.debug("registered {} push token for trainer {}", body.platform(), trainerId);

        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/token")
    @Transactional
    public ResponseEntity<Void> unregister() {
        trainerRepo.findById(currentTrainerId()).ifPresent(t -> {
            t.setFcmToken(null);
            trainerRepo.save(t);
        });
        return ResponseEntity.noContent().build();
    }

    private UUID currentTrainerId() {
        return UUID.fromString(
                SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
