package com.inclineyou.inclineyou_backend.core.auth;

import com.inclineyou.inclineyou_backend.core.auth.dto.SessionItem;
import com.inclineyou.inclineyou_backend.shared.wire.Items;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

/**
 * {@code /v1/auth/sessions} — the one path shape for signed-in devices
 * (api-contract v1.1, Settings A10).
 *
 * <p>Authenticated, any role: a client signed in on the web has browsers too.
 * {@code SecurityConfig} carries the rule, because everything else under
 * {@code /v1/auth/} is public.
 */
@RestController
@RequestMapping("/v1/auth/sessions")
@RequiredArgsConstructor
public class SessionsController {

    private final SessionService service;

    @GetMapping
    public Items<SessionItem> list(HttpServletRequest request) {
        return Items.of(service.list(caller(), rawToken(request)));
    }

    /** One browser; {@code current} is sign-out. 204 and idempotent. */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void signOut(@PathVariable String id, HttpServletRequest request) {
        service.signOut(caller(), rawToken(request), id);
    }

    /** {@code ?scope=others}: everywhere but here. */
    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void signOutOthers(@RequestParam(required = false) String scope, HttpServletRequest request) {
        service.signOutOthers(caller(), rawToken(request), scope);
    }

    private static String caller() {
        return SecurityContextHolder.getContext().getAuthentication().getName();
    }

    private static String rawToken(HttpServletRequest request) {
        return (String) request.getAttribute(AuthTokenFilter.TOKEN_ATTRIBUTE);
    }
}
