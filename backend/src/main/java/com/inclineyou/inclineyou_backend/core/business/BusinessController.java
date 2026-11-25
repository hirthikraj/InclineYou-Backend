package com.inclineyou.inclineyou_backend.core.business;

import com.inclineyou.inclineyou_backend.core.business.dto.Business;
import com.inclineyou.inclineyou_backend.core.business.dto.BusinessUpdate;
import com.inclineyou.inclineyou_backend.core.business.dto.PaymentSetupUpdate;
import com.inclineyou.inclineyou_backend.core.tenant.CurrentScope;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/** Settings → Business (api-contract 1.2, bz-a1…bz-a3; V46). Always the ACTIVE workspace's business. */
@RestController
@RequiredArgsConstructor
public class BusinessController {

    private final BusinessService business;

    @GetMapping("/v1/business")
    public Business get() {
        return business.get(trainerId(), CurrentScope.require().activeTenantId());
    }

    @PutMapping("/v1/business")
    public Business save(@Valid @RequestBody BusinessUpdate body) {
        return business.save(trainerId(), CurrentScope.require().activeTenantId(), body);
    }

    /** Business → Payment setup (V50): the UPI ID clients pay and the part-payment switch. Owner-only. */
    @PutMapping("/v1/business/payments")
    public Business savePayments(@Valid @RequestBody PaymentSetupUpdate body) {
        return business.savePayments(trainerId(), CurrentScope.require().activeTenantId(), body);
    }

    /** The states and union territories the address takes, in the order the picker lists them. */
    @GetMapping("/v1/business/states")
    public List<String> states() {
        return IndianStates.ALL;
    }

    private static UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
