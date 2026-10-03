package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.payment.dto.MoneySummary;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * {@code GET /v1/money/summary} — see {@link MoneySummaryService}.
 *
 * <p>STANDARD tier: a handful of indexed aggregates, and nothing is sent.
 */
@RestController
@RequiredArgsConstructor
public class MoneyController {

    private final MoneySummaryService service;

    @GetMapping("/v1/money/summary")
    public MoneySummary summary(
            @RequestParam(required = false) Integer months,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {
        return service.summary(trainerId(), months, from, to);
    }

    private UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
