package com.trainx.trainx_backend.report;

import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
@RequestMapping("/v1")
public class ReportController {

    private final ReportService reportService;

    @GetMapping("/clients/{clientId}/report")
    public Map<String, String> getReport(@PathVariable UUID clientId) {
        UUID trainerId = UUID.fromString(
                SecurityContextHolder.getContext().getAuthentication().getName());
        return Map.of("report", reportService.generateReport(trainerId, clientId));
    }
}
