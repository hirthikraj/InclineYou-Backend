package com.inclineyou.inclineyou_backend.core.trainer;

import com.inclineyou.inclineyou_backend.core.trainer.dto.WorkingHourResponse;
import com.inclineyou.inclineyou_backend.shared.wire.Items;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import com.inclineyou.inclineyou_backend.core.trainer.dto.WorkingHoursPatch;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * `GET /v1/working-hours` — the trainer's own week.
 *
 * Its own route rather than a field on `/v1/trainers/me`, because it is a list
 * with its own table, its own row ids and its own lifecycle: hanging seven-to-
 * fourteen rows off the profile response would make every profile read carry
 * them, including the six PATCHes the setup flow performs.
 *
 * Bounded — a handful of windows a day — so `{items}` with no cursor (1.1).
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
    public Items<WorkingHourResponse> list() {
        return Items.of(service.list(trainerId()));
    }

    /**
     * Replace the weekdays that changed (v1.1; was PUT, and before that a push through the sync
     * envelope). PATCH because it is a partial edit — unlisted days are untouched. Answers the whole
     * week in the GET's own shape.
     */
    @PatchMapping
    public Items<WorkingHourResponse> replace(@RequestBody WorkingHoursPatch body) {
        return Items.of(service.replace(trainerId(), body));
    }

    private UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
