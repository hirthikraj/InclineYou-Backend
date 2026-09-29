package com.inclineyou.inclineyou_backend.payment;

import com.inclineyou.inclineyou_backend.exception.ApiException;
import com.inclineyou.inclineyou_backend.wire.Items;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class PackageController {

    private final PackageLedgerService ledger;
    private final PackageReadService reads;
    private final PackageRenewService renewals;
    private final PackageSaleService sales;

    // ── Packages ──────────────────────────────────────────────────────────────

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
            @RequestBody(required = false) Map<String, Object> body
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

    // ── The pack's life · api-contract 1.1 Client file A1, A11 ─────────────────

    /**
     * Pause, resume, extend and cancel are POSTs on their own paths rather than
     * fields on a {@code PATCH /v1/packages/{id}}: each is an event with its own
     * precondition, and the first three write a `package_adjustment` row that the
     * trigger applies. There is deliberately no route that sets a session count.
     */
    @PostMapping("/v1/packages/{packageId}/pause")
    public PackageReadService.CurrentPackage pausePackage(@PathVariable UUID packageId,
                                                          @RequestBody(required = false) Map<String, Object> body) {
        return ledger.pause(trainerId(), packageId, body);
    }

    @PostMapping("/v1/packages/{packageId}/resume")
    public PackageReadService.CurrentPackage resumePackage(@PathVariable UUID packageId,
                                                           @RequestBody(required = false) Map<String, Object> body) {
        return ledger.resume(trainerId(), packageId, body);
    }

    @PostMapping("/v1/packages/{packageId}/extend")
    public PackageReadService.CurrentPackage extendPackage(@PathVariable UUID packageId,
                                                           @RequestBody(required = false) Map<String, Object> body) {
        return ledger.extend(trainerId(), packageId, body);
    }

    /** R74 — end one deal early, once nothing is owed. */
    @PostMapping("/v1/packages/{packageId}/cancel")
    public PackageReadService.CurrentPackage cancelPackage(@PathVariable UUID packageId,
                                                           @RequestBody(required = false) Map<String, Object> body) {
        return ledger.cancel(trainerId(), packageId, body);
    }

    /** Everything that has happened to this pack, oldest first. Append-only. */
    @GetMapping("/v1/packages/{packageId}/adjustments")
    public Items<PackageLedgerService.Adjustment> listAdjustments(@PathVariable UUID packageId,
                                                                  @RequestParam(required = false) String kind) {
        return Items.of(ledger.adjustments(trainerId(), packageId, kind));
    }

    // ── Payments ──────────────────────────────────────────────────────────────

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

    /** A2 — 201 the first time, 200 on a replayed id. */
    @PostMapping("/v1/packages/{packageId}/payments")
    public ResponseEntity<Map<String, Object>> createPayment(@PathVariable UUID packageId,
                                                             @RequestBody(required = false) Map<String, Object> body) {
        return created(ledger.record(trainerId(), packageId, body));
    }

    @PostMapping("/v1/payments/{paymentId}/paid")
    public Map<String, Object> markPaid(@PathVariable UUID paymentId,
                                        @RequestBody(required = false) Map<String, Object> body) {
        return ledger.markPaid(trainerId(), paymentId, body).body();
    }

    @PostMapping("/v1/payments/{paymentId}/write-off")
    public Map<String, Object> writeOffPayment(@PathVariable UUID paymentId,
                                               @RequestBody(required = false) Map<String, Object> body) {
        return ledger.writeOffPayment(trainerId(), paymentId, body).body();
    }

    @PostMapping("/v1/packages/{packageId}/write-off")
    public ResponseEntity<Map<String, Object>> writeOffPackage(@PathVariable UUID packageId,
                                                               @RequestBody(required = false) Map<String, Object> body) {
        return created(ledger.writeOffPackage(trainerId(), packageId, body));
    }

    @PostMapping("/v1/packages/{packageId}/refund")
    public ResponseEntity<Map<String, Object>> refund(@PathVariable UUID packageId,
                                                      @RequestBody(required = false) Map<String, Object> body) {
        return created(ledger.refund(trainerId(), packageId, body));
    }

    @PatchMapping("/v1/payments/{paymentId}")
    public Map<String, Object> patchPayment(@PathVariable UUID paymentId,
                                            @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                            @RequestBody(required = false) Map<String, Object> body) {
        return ledger.patch(trainerId(), paymentId, ifMatch, body).body();
    }

    @DeleteMapping("/v1/payments/{paymentId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deletePayment(@PathVariable UUID paymentId) {
        ledger.delete(trainerId(), paymentId);
    }

    private static ResponseEntity<Map<String, Object>> created(PackageLedgerService.Ledgered l) {
        return ResponseEntity.status(l.created() ? HttpStatus.CREATED : HttpStatus.OK).body(l.body());
    }

    private UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
