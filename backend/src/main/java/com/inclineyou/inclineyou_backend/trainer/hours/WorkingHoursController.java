package com.inclineyou.inclineyou_backend.trainer.hours;

import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * `GET /v1/working-hours` — the trainer's own week.
 *
 * Its own route rather than a field on `/v1/trainers/me`, because it is a list
 * with its own table, its own row ids and its own lifecycle: hanging seven-to-
 * fourteen rows off the profile response would make every profile read carry
 * them, including the six PATCHes the setup flow performs.
 *
 * `anyRequest().hasRole("TRAINER")` in `SecurityConfig` covers this path, and
 * `RateLimitFilter` puts it in the STANDARD tier — which is right: it costs one
 * indexed query and spends no WhatsApp message.
 */
@RestController
@RequestMapping("/v1/working-hours")
@RequiredArgsConstructor
public class WorkingHoursController {

    private final WorkingHoursService service;

    @GetMapping
    public List<WorkingHoursService.WorkingHourResponse> list() {
        return service.list(trainerId());
    }

    private UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
