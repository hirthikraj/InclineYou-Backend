package com.inclineyou.inclineyou_backend.payment;

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

    /**
     * Every package on the roster. Trainer-scoped, `?status=` to narrow.
     *
     * Sits beside the per-client route rather than replacing it, because they
     * answer different questions — see {@code PackageService.listAllPackages}.
     * Added for the web's Today screen, which needs to know who is running out
     * of sessions without asking once per client.
     */
    @GetMapping("/v1/packages")
    public List<PackageService.PackageResponse> listAllPackages(
            @RequestParam(required = false) String status
    ) {
        return service.listAllPackages(trainerId(), status);
    }

    @PostMapping("/v1/clients/{clientId}/packages")
    @ResponseStatus(HttpStatus.CREATED)
    public PackageService.PackageResponse createPackage(
            @PathVariable String clientId,
            @Valid @RequestBody PackageService.CreatePackageRequest req
    ) {
        return service.createPackage(trainerId(), clientId, req);
    }

    /**
     * RENEW — one call, and an empty body is a complete request.
     *
     * <p>A POST rather than a PATCH because it CREATES a package: the old row is
     * left exactly as it is, which is what keeps a client's history readable and
     * what the money book is still owed against. "Same package, new instance" is
     * the brief, and the instance is the thing this returns.
     *
     * <p>Sits on the OLD package's id rather than on the client's, because the
     * question a renewal answers is *repeat this one* — a client with two packs
     * behind them has two different renewals available, and a client-scoped route
     * would have to guess which.
     */
    @PostMapping("/v1/packages/{packageId}/renew")
    @ResponseStatus(HttpStatus.CREATED)
    public PackageService.PackageResponse renewPackage(
            @PathVariable String packageId,
            @RequestBody(required = false) PackageService.RenewPackageRequest req
    ) {
        return service.renewPackage(trainerId(), packageId, req);
    }

    // ── The pack's life · V30 ─────────────────────────────────────────────────

    /**
     * Pause, resume and extend are POSTs on their own paths rather than fields on
     * a {@code PATCH /v1/packages/{id}}, and that is the one design decision here
     * worth defending.
     *
     * <p><b>They are events, not edits.</b> Each one writes a `package_adjustment`
     * row as well as changing the pack, and each has a precondition the other two
     * do not — pausing a paused pack, resuming a running one, extending one with
     * no expiry. A single PATCH would have to infer which event was meant from
     * which fields arrived, and answer one status for three different conflicts.
     *
     * <p>It also keeps the dangerous door shut. `BACKEND_GAPS.md` §6 asks for a
     * general `PATCH /v1/packages/{id}` carrying `sessionsRemaining` and calls it
     * "the more general answer and the more dangerous one" — a route that can set
     * a session count directly is a route that can silently undo a charge the
     * diary's 24-hour undo is built to reverse properly. These three cannot: they
     * move dates and nothing else.
     */
    @PostMapping("/v1/packages/{packageId}/pause")
    public PackageService.PackageResponse pausePackage(
            @PathVariable String packageId,
            @RequestBody(required = false) PackageService.PausePackageRequest req
    ) {
        return service.pausePackage(trainerId(), packageId, req);
    }

    @PostMapping("/v1/packages/{packageId}/resume")
    public PackageService.PackageResponse resumePackage(
            @PathVariable String packageId,
            @RequestBody(required = false) PackageService.PausePackageRequest req
    ) {
        return service.resumePackage(trainerId(), packageId, req);
    }

    @PostMapping("/v1/packages/{packageId}/extend")
    public PackageService.PackageResponse extendPackage(
            @PathVariable String packageId,
            @Valid @RequestBody PackageService.ExtendPackageRequest req
    ) {
        return service.extendPackage(trainerId(), packageId, req);
    }

    /** Everything that has happened to this pack, oldest first. Append-only. */
    @GetMapping("/v1/packages/{packageId}/adjustments")
    public List<PackageService.AdjustmentResponse> listAdjustments(@PathVariable String packageId) {
        return service.listAdjustments(trainerId(), packageId);
    }

    // ── Payments ──────────────────────────────────────────────────────────────

    @GetMapping("/v1/packages/{packageId}/payments")
    public List<PackageService.PaymentResponse> listPayments(@PathVariable String packageId) {
        return service.listPayments(trainerId(), packageId);
    }

    /**
     * The trainer's money across the whole roster. `from`/`to` are epoch ms on
     * `created_at` and `to` is exclusive — the same convention as
     * `GET /v1/sessions`, so the two windows read alike.
     *
     * Route order matters here and the framework gets it right for the wrong-
     * looking reason: `/v1/payments/{paymentId}/confirm` is a PATCH on a longer
     * path, so this GET cannot shadow it.
     */
    @GetMapping("/v1/payments")
    public List<PackageService.PaymentResponse> listAllPayments(
            @RequestParam(required = false) Long from,
            @RequestParam(required = false) Long to,
            @RequestParam(required = false) String status
    ) {
        return service.listAllPayments(trainerId(), from, to, status);
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
