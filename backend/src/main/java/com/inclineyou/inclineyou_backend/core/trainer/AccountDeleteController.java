package com.inclineyou.inclineyou_backend.core.trainer;

import com.inclineyou.inclineyou_backend.core.auth.AuthTokenFilter;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * {@code DELETE /v1/trainers/me} — close the account (api-contract v1.1, Settings A10).
 *
 * <p>Its own class because {@link AccountController} is
 * {@code @RequestMapping("/v1/trainers/me/phone")} and this is the resource itself.
 *
 * <p>The proof is a step-up ticket in the {@code X-Step-Up-Ticket} header and NO body —
 * a DELETE with a body is the surprise the archive verb was written to avoid. With
 * no ticket the answer is 403 {@code STEP_UP_REQUIRED}.
 */
@RestController
@RequestMapping("/v1/trainers/me")
@RequiredArgsConstructor
public class AccountDeleteController {

    public static final String TICKET_HEADER = "X-Step-Up-Ticket";

    private final AccountService service;

    @DeleteMapping
    public ResponseEntity<Void> delete(
            @RequestHeader(value = TICKET_HEADER, required = false) String ticket,
            HttpServletRequest request) {
        service.deleteAccount(trainerId(), ticket,
                (String) request.getAttribute(AuthTokenFilter.TOKEN_ATTRIBUTE));
        // 204: there is nothing left to describe, and a body here would be a
        // description of a thing the caller has just asked us to stop having.
        return ResponseEntity.noContent().build();
    }

    private UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
