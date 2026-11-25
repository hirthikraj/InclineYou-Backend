package com.inclineyou.inclineyou_backend.core.portal;

import com.inclineyou.inclineyou_backend.core.portal.dto.PortalMoney;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * The client's package and money (api-contract 1.2, pm-l1 and pm-l2), and since V50 "I've paid" (pm-a1, pm-a2) and receipts (pm-l3).
 * {@link PortalAccess} refuses a paused or removed client. The two writes go through SECURITY DEFINER doors; a client has no write
 * policy on any money table.
 */
@RestController
@RequestMapping("/v1/portal")
@RequiredArgsConstructor
public class PortalMoneyController {

    private final PortalMoneyService service;

    private static String phone() {
        return SecurityContextHolder.getContext().getAuthentication().getName();
    }

    private static <T> ResponseEntity<T> noStore(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    @GetMapping("/package")
    public ResponseEntity<PortalMoney.Package> pack() {
        return noStore(service.pack(phone()));
    }

    @GetMapping("/money")
    public ResponseEntity<PortalMoney.Money> money(@RequestParam(defaultValue = "20") int limit, @RequestParam(required = false) String cursor) {
        return noStore(service.money(phone(), limit, cursor));
    }

    /** pm-a1 · "I've paid": 201 with the report, or 200 when the id was already made by this client (a retried tap). */
    @PostMapping("/payment-claims")
    public ResponseEntity<com.inclineyou.inclineyou_backend.core.payment.dto.PaymentClaim> claim(@Valid @RequestBody PortalMoney.ClaimRequest body) {
        var c = service.claim(phone(), body);
        return ResponseEntity.status(c.created() ? HttpStatus.CREATED : HttpStatus.OK).cacheControl(CacheControl.noStore()).body(c.claim());
    }

    /** pm-a2 · take back an open report. 204, again on a repeat; 409 CLAIM_DECIDED once the trainer has answered. */
    @DeleteMapping("/payment-claims/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void withdraw(@PathVariable UUID id) {
        service.withdraw(phone(), id);
    }

    /** pm-l3 · a receipt for one of the client's own collected payments. */
    @GetMapping("/payments/{id}/receipt")
    public ResponseEntity<PortalMoney.Receipt> receipt(@PathVariable UUID id) {
        return noStore(service.receipt(phone(), id));
    }
}
