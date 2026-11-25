package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.payment.dto.PaymentClaim;
import com.inclineyou.inclineyou_backend.shared.wire.Items;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

/**
 * api-contract 1.2 · "I've paid" (V50), the trainer's half: the To confirm queue and the two decisions. STANDARD tier —
 * nothing here sends. Trainer-scoped by {@code SecurityConfig} and by {@code WHERE trainer_id}; a wrong id is a 404.
 * Bodies are maps, as in the money writes: confirm's keys are each "use this instead of what the client said".
 */
@RestController
@RequiredArgsConstructor
public class PaymentClaimController {

    private final PaymentClaimService service;

    /** pc-l1 · {@code ?status=open} (the default) · confirmed · declined · withdrawn; {@code ?clientId=}; {@code ?limit=} 1–100, 50. */
    @GetMapping("/v1/payment-claims")
    public Items<PaymentClaim> list(@RequestParam(required = false) String status,
                                    @RequestParam(required = false) UUID clientId,
                                    @RequestParam(required = false) Integer limit) {
        return Items.of(service.list(trainerId(), status, clientId, limit));
    }

    /** pc-l2 · records the payment and marks the claim confirmed: {@code {claim, payment, package}}. */
    @PostMapping("/v1/payment-claims/{id}/confirm")
    public Map<String, Object> confirm(@PathVariable UUID id, @RequestBody(required = false) Map<String, Object> body) {
        return service.confirm(trainerId(), id, body).body();
    }

    /** pc-l3 · not received: {@code {reason?}}, which the client sees. */
    @PostMapping("/v1/payment-claims/{id}/decline")
    public PaymentClaim decline(@PathVariable UUID id, @RequestBody(required = false) Map<String, Object> body) {
        return service.decline(trainerId(), id, body);
    }

    /** pc-l4 · Undo of a decline. */
    @PostMapping("/v1/payment-claims/{id}/reopen")
    public PaymentClaim reopen(@PathVariable UUID id) {
        return service.reopen(trainerId(), id);
    }

    private static UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
