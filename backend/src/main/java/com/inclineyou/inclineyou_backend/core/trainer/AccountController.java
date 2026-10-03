package com.inclineyou.inclineyou_backend.core.trainer;

import com.inclineyou.inclineyou_backend.core.auth.AuthTokenFilter;
import com.inclineyou.inclineyou_backend.core.trainer.dto.ConfirmNewPhoneRequest;
import com.inclineyou.inclineyou_backend.core.trainer.dto.NewPhoneRequest;
import com.inclineyou.inclineyou_backend.core.trainer.dto.PhoneChangedResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * CHANGING THE SIGN-IN NUMBER — the two requests after a step-up
 * (api-contract v1.1, Settings A9/A10).
 *
 * <p>Separate from {@link TrainerController}, which is one GET and one PATCH over a
 * profile: everything here rewrites an identity and carries a proof a profile PATCH
 * has no concept of. They sit under {@code /v1/trainers/me/} regardless, because
 * that is the resource — {@code SecurityConfig}'s {@code anyRequest().hasRole
 * ("TRAINER")} covers the prefix, so a client token, an invited token and a step-up
 * ticket presented as a bearer are all refused before any of this runs.
 *
 * <p>AUTH rate tier ({@code RateLimitFilter}): a code to a new number plus a swap of
 * the sign-in credential is an authentication act.
 */
@RestController
@RequestMapping("/v1/trainers/me/phone")
@RequiredArgsConstructor
@Validated
public class AccountController {

    private final AccountService service;

    /** 1 · the new number, checked before a message is spent on it. 204. */
    @PostMapping("/request")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void request(@Valid @RequestBody NewPhoneRequest body, HttpServletRequest request) {
        service.requestNewPhone(trainerId(), body, rawToken(request));
    }

    /** 2 · the code from the new number, and the swap. {@code {phone}}; the caller's session survives. */
    @PostMapping("/confirm")
    public PhoneChangedResponse confirm(@Valid @RequestBody ConfirmNewPhoneRequest body, HttpServletRequest request) {
        return service.confirmNewPhone(trainerId(), body, rawToken(request));
    }

    private UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }

    private static String rawToken(HttpServletRequest request) {
        return (String) request.getAttribute(AuthTokenFilter.TOKEN_ATTRIBUTE);
    }
}
