package com.inclineyou.inclineyou_backend.core.report;

import com.inclineyou.inclineyou_backend.core.report.dto.ReportResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequiredArgsConstructor
@RequestMapping("/v1")
public class ReportController {

    private final ReportService reportService;

    @GetMapping("/clients/{clientId}/report")
    public ReportResponse getReport(@PathVariable UUID clientId) {
        return new ReportResponse(reportService.generateReport(currentTrainerId(), clientId));
    }

    private UUID currentTrainerId() {
        return UUID.fromString(
                SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
