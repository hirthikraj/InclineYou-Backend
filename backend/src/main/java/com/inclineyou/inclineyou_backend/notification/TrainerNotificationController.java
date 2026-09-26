package com.inclineyou.inclineyou_backend.notification;

import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/** V15 · the trainer's bell. */
@RestController
@RequestMapping("/v1/notifications")
@RequiredArgsConstructor
public class TrainerNotificationController {

    private final TrainerNotificationService service;

    @GetMapping
    public List<TrainerNotificationService.Notification> feed() {
        return service.feed(trainerId());
    }

    /* The literal `/read` is declared before `/{id}/read`; they differ in depth,
       so they cannot collide, but reading them in this order says which is which. */
    @PostMapping("/read")
    public List<TrainerNotificationService.Notification> readAll() {
        return service.markAllRead(trainerId());
    }

    @PostMapping("/{id}/read")
    public TrainerNotificationService.Notification read(@PathVariable UUID id) {
        return service.markRead(trainerId(), id);
    }

    private UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
