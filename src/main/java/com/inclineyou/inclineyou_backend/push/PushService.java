package com.inclineyou.inclineyou_backend.push;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.*;
import com.inclineyou.inclineyou_backend.config.AppProperties;
import com.inclineyou.inclineyou_backend.repository.TrainerRepository;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayInputStream;
import java.io.FileInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;

/**
 * Sends FCM pushes, and degrades to logging when no Firebase credentials are
 * configured — which is the normal state in dev, so nothing here should ever be
 * a startup blocker.
 *
 * <p>Set {@code app.fcm.credentials} (env {@code FCM_CREDENTIALS}) to the service-account
 * JSON — raw, a file path, or {@code classpath:…} — to turn real sending on.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PushService {

    private static final String APP_NAME = "inclineyou";

    private final AppProperties props;
    private final TrainerRepository trainerRepo;

    /** Null when FCM isn't configured. Everything below tolerates that. */
    private FirebaseMessaging messaging;

    @PostConstruct
    void init() {
        String credentials = props.getFcm().getCredentials();
        if (credentials == null || credentials.isBlank()) {
            log.info("FCM disabled — app.fcm.credentials is not set. Pushes will be logged, not sent.");
            return;
        }

        try (InputStream in = openCredentials(credentials.trim())) {
            var options = FirebaseOptions.builder()
                    .setCredentials(GoogleCredentials.fromStream(in))
                    .build();

            FirebaseApp app = FirebaseApp.getApps().stream()
                    .filter(a -> APP_NAME.equals(a.getName()))
                    .findFirst()
                    .orElseGet(() -> FirebaseApp.initializeApp(options, APP_NAME));

            messaging = FirebaseMessaging.getInstance(app);
            log.info("FCM initialised (project={})", app.getOptions().getProjectId());
        } catch (Exception e) {
            // A bad key must not take the API down — everything else still works.
            log.error("FCM initialisation failed; pushes will be logged, not sent", e);
        }
    }

    private InputStream openCredentials(String value) throws Exception {
        if (value.startsWith("{")) {
            return new ByteArrayInputStream(value.getBytes(StandardCharsets.UTF_8));
        }
        if (value.startsWith("classpath:")) {
            return new ClassPathResource(value.substring("classpath:".length())).getInputStream();
        }
        return new FileInputStream(value);
    }

    public boolean isEnabled() {
        return messaging != null;
    }

    /**
     * Best-effort push to a trainer's registered device. Never throws — a failed
     * notification must not roll back the business write that triggered it.
     */
    @Transactional
    public void sendToTrainer(UUID trainerId, String title, String body, Map<String, String> data) {
        var trainer = trainerRepo.findById(trainerId).orElse(null);
        if (trainer == null || trainer.getFcmToken() == null || trainer.getFcmToken().isBlank()) {
            log.debug("push skipped: trainer {} has no device token", trainerId);
            return;
        }

        if (messaging == null) {
            log.info("[FCM disabled] would push to trainer {}: {} — {}", trainerId, title, body);
            return;
        }

        var message = Message.builder()
                .setToken(trainer.getFcmToken())
                .setNotification(Notification.builder().setTitle(title).setBody(body).build())
                .putAllData(data == null ? Map.of() : data)
                .setAndroidConfig(AndroidConfig.builder()
                        .setPriority(AndroidConfig.Priority.HIGH)
                        .build())
                .build();

        try {
            messaging.send(message);
        } catch (FirebaseMessagingException e) {
            if (e.getMessagingErrorCode() == MessagingErrorCode.UNREGISTERED
                    || e.getMessagingErrorCode() == MessagingErrorCode.INVALID_ARGUMENT) {
                // The app was uninstalled or the token rotated — drop it so we stop retrying.
                log.info("Dropping stale FCM token for trainer {} ({})", trainerId, e.getMessagingErrorCode());
                trainer.setFcmToken(null);
                trainerRepo.save(trainer);
            } else {
                log.warn("FCM send failed for trainer {}: {}", trainerId, e.getMessage());
            }
        }
    }
}
