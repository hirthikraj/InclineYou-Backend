package com.inclineyou.inclineyou_backend.core.notification;

import com.inclineyou.inclineyou_backend.core.notification.dto.Bell;
import com.inclineyou.inclineyou_backend.shared.wire.EmptyBody;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * The trainer's bell (api-contract 1.2, tr-b1). A trainer's route; {@code STANDARD} tier — nothing here sends a message.
 */
@RestController
@RequestMapping("/v1/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService service;

    /** What the portal did over the last fourteen days, newest first, with how many are new since the trainer last looked. */
    @GetMapping
    public Bell bell(@RequestParam(required = false) Integer limit) {
        return service.bell(trainerId(), limit);
    }

    /** Mark the bell read: sets the one column the count is measured against. Idempotent. */
    @PostMapping("/seen")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void seen(@RequestBody(required = false) EmptyBody body) {
        service.markSeen(trainerId());
    }

    private UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
