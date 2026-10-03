package com.inclineyou.inclineyou_backend.core.payment;

import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/** {@code GET /v1/reports/practice} — see {@link PracticeReportService}. STANDARD tier. */
@RestController
@RequiredArgsConstructor
public class PracticeReportController {

    private final PracticeReportService service;

    @GetMapping("/v1/reports/practice")
    public PracticeReportService.Report practice(@RequestParam(required = false) Integer months) {
        return service.practice(UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName()), months);
    }
}
