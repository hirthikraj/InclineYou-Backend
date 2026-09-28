package com.inclineyou.inclineyou_backend.payment;

import com.inclineyou.inclineyou_backend.exception.ApiException;
import com.inclineyou.inclineyou_backend.wire.Items;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class PackageController {

    private final PackageService service;
    private final PackageReadService reads;
    private final PackageRenewService renewals;
    private final PackageSaleService sales;

    // ── Packages ──────────────────────────────────────────────────────────────

    @GetMapping("/v1/clients/{clientId}/packages")
    public List<PackageService.PackageResponse> listPackages(@PathVariable String clientId) {
        return service.listPackages(trainerId(), clientId);
    }

    /**
     * api-contract Today L5 / Client file L1 — packages with owed money computed
     * on the server. {@code scope=current} is the packs that matter today (1.1:
     * renamed from {@code view}, which means a row's shape everywhere else);
     * {@code clientId} narrows to one client, and without a scope gives every
     * package they bought. One of the two is required: an unscoped, unfiltered
     * read would be every package ever sold.
     */
    @GetMapping("/v1/packages")
    public Items<PackageReadService.CurrentPackage> listPackages(
            @RequestParam(required = false) String scope,
            @RequestParam(required = false) String clientId
    ) {
        if (scope != null && !"current".equals(scope)) {
            throw ApiException.validation("scope: only 'current' is defined");
        }
        UUID client = null;
        if (clientId != null && !clientId.isBlank()) {
            try {
                client = UUID.fromString(clientId.strip());
            } catch (IllegalArgumentException e) {
                throw ApiException.validation("clientId: not a client id");
            }
        }
        if (scope == null && client == null) {
            throw ApiException.validation("scope=current or clientId is required");
        }
        return Items.of(reads.list(trainerId(), scope != null, client));
    }

    /** api-contract 1.1 Clients A7 — 201 the first time, 200 on a replayed id. */
    @PostMapping("/v1/clients/{clientId}/packages")
    public ResponseEntity<PackageReadService.CurrentPackage> createPackage(
            @PathVariable UUID clientId,
            @RequestBody(required = false) java.util.Map<String, Object> body
    ) {
        var sold = sales.sell(trainerId(), clientId, body);
        return ResponseEntity.status(sold.created() ? HttpStatus.CREATED : HttpStatus.OK).body(sold.pkg());
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
    public ResponseEntity<PackageReadService.CurrentPackage> renewPackage(
            @PathVariable UUID packageId,
            @RequestBody(required = false) PackageRenewService.RenewRequest req
    ) {
        // 201 the first time; a replayed id answers 200 with the same package.
        var renewed = renewals.renew(trainerId(), packageId, req);
        return ResponseEntity.status(renewed.created() ? HttpStatus.CREATED : HttpStatus.OK).body(renewed.pkg());
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

    /**
     * CORRECT THE COUNT — V4. The pack was sold with twelve and says ten.
     *
     * <p>Not how a client buys more: that is {@code /renew} with a
     * {@code startDate} of today, which writes a second package because a
     * package is a sale. This moves {@code sessions_total} and
     * {@code sessions_remaining} and never the price. See
     * {@link PackageService#correctSessions}.
     */
    @PostMapping("/v1/packages/{packageId}/sessions")
    public PackageService.PackageResponse correctSessions(
            @PathVariable String packageId,
            @Valid @RequestBody PackageService.CorrectSessionsRequest req
    ) {
        return service.correctSessions(trainerId(), packageId, req);
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
     * api-contract Business L2 = Today L7 — the ledger, keyset-paged on bookAt.
     * Dates in the workspace timezone, {@code to} exclusive.
     */
    @GetMapping("/v1/payments")
    public PackageReadService.Ledger listPayments(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(required = false) String method,
            @RequestParam(required = false) String clientId,
            @RequestParam(required = false) String packageId,
            @RequestParam(required = false) String collectedBy,
            @RequestParam(required = false) String clientType,
            @RequestParam(required = false) Integer limit,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "false") boolean includeTotal
    ) {
        return reads.payments(trainerId(), new PackageReadService.LedgerQuery(
                status, from, to, method, clientId, packageId, collectedBy, clientType, limit, cursor, includeTotal));
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

    /** V8 · stop chasing it. The body is optional; see {@code writeOffPayment}. */
    @PatchMapping("/v1/payments/{paymentId}/write-off")
    public PackageService.PaymentResponse writeOffPayment(
            @PathVariable String paymentId,
            @RequestBody(required = false) PackageService.WriteOffRequest req
    ) {
        return service.writeOffPayment(trainerId(), paymentId, req);
    }

    /** V8 · give a collected payment a bill number. Idempotent; no body. */
    @PostMapping("/v1/payments/{paymentId}/invoice")
    public PackageService.PaymentResponse issueInvoice(@PathVariable String paymentId) {
        return service.issueInvoice(trainerId(), paymentId);
    }

    private UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
