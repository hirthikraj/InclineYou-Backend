package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.payment.dto.ActivityFeed;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/** {@code GET /v1/money/activity} — see {@link MoneyActivityService}. STANDARD tier. */
@RestController
@RequiredArgsConstructor
public class MoneyActivityController {

    private final MoneyActivityService service;

    @GetMapping("/v1/money/activity")
    public ActivityFeed activity(
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(required = false) Integer limit,
            @RequestParam(required = false) String cursor) {
        return service.activity(UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName()),
                from, to, limit, cursor);
    }
}
