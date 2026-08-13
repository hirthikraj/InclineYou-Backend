package com.xrep.xrep_backend.payment;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class PackageController {

    private final PackageService service;

    // ── Packages ──────────────────────────────────────────────────────────────

    @GetMapping("/v1/clients/{clientId}/packages")
    public List<PackageService.PackageResponse> listPackages(@PathVariable String clientId) {
        return service.listPackages(trainerId(), clientId);
    }

    @PostMapping("/v1/clients/{clientId}/packages")
    @ResponseStatus(HttpStatus.CREATED)
    public PackageService.PackageResponse createPackage(
            @PathVariable String clientId,
            @Valid @RequestBody PackageService.CreatePackageRequest req
    ) {
        return service.createPackage(trainerId(), clientId, req);
    }

    // ── Payments ──────────────────────────────────────────────────────────────

    @GetMapping("/v1/packages/{packageId}/payments")
    public List<PackageService.PaymentResponse> listPayments(@PathVariable String packageId) {
        return service.listPayments(trainerId(), packageId);
    }

    @PostMapping("/v1/packages/{packageId}/payments")
    @ResponseStatus(HttpStatus.CREATED)
    public PackageService.PaymentResponse createPayment(
            @PathVariable String packageId,
            @Valid @RequestBody PackageService.CreatePaymentRequest req
    ) {
        return service.createPayment(trainerId(), packageId, req);
    }

    @PatchMapping("/v1/payments/{paymentId}/confirm")
    public PackageService.PaymentResponse confirmPayment(
            @PathVariable String paymentId,
            @RequestBody PackageService.ConfirmPaymentRequest req
    ) {
        return service.confirmPayment(trainerId(), paymentId, req);
    }

    private UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
