package com.inclineyou.inclineyou_backend.core.payment;

import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * {@code GET /v1/payments/export} — the ledger as CSV, streamed (see {@link PaymentExportService} for
 * why in the request thread). The controller owns only the HTTP side: the status, the content type
 * and the attachment name, committed once the service has read a first good page.
 */
@RestController
@RequiredArgsConstructor
public class PaymentExportController {

    private final PaymentExportService exports;

    @GetMapping("/v1/payments/export")
    public void export(
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String method,
            @RequestParam(required = false) String clientId,
            @RequestParam(required = false) String collectedBy,
            @RequestParam(required = false) String clientType,
            HttpServletResponse response) throws IOException {
        UUID tid = UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
        exports.export(tid, from, to, status, method, clientId, collectedBy, clientType, filename -> {
            response.setStatus(200);
            response.setContentType("text/csv; charset=utf-8");
            response.setHeader("Content-Disposition", "attachment; filename=\"" + filename + "\"");
            return new OutputStreamWriter(response.getOutputStream(), StandardCharsets.UTF_8);
        });
    }
}
